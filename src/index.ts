#!/usr/bin/env node
// ./mcp/src/index.ts
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { program } from "commander";
import { appConfig } from "@/config";
import type { Resource } from "@/resources/resource";
import { createServerWithTools } from "@/server";
import * as common from "@/tools/common";
import * as snapshotTools from "@/tools/snapshot";
import * as bulk from "@/tools/bulk";
import type { Tool } from "@/types/mcp/tool.schemas";
import packageJSON from "../package.json";

function setupExitWatchdog(server: Server) {
    process.stdin.on("close", async () => {
    setTimeout(() => process.exit(0), 15000);
    await server.close();
    process.exit(0);
    });
}

// This list correctly references all tools from the updated factory system.
// Tools now have intelligent defaults built-in, eliminating repetitive (true)/(false) calls.
// Users can still override defaults by calling factories explicitly: toolFactory(false)

const allTools: Tool[] = [
    // Snapshot/Interaction tools (using built-in defaults)
    snapshotTools.snapshot,
    snapshotTools.click(),          // Default: snapshots enabled (true)
    snapshotTools.hover(),          // Default: snapshots disabled (false) - hovers are temporary
    snapshotTools.type(),           // Default: snapshots enabled (true)
    snapshotTools.selectOption(),   // Default: snapshots enabled (true)
    snapshotTools.drag(),           // Default: snapshots enabled (true)

    // Navigation and automation tools (using built-in defaults)
    common.setActiveTab(),          // Default: snapshots enabled (true)
    common.navigate(),              // Default: snapshots enabled (true)
    common.goBack(),                // Default: snapshots enabled (true)
    common.goForward(),             // Default: snapshots enabled (true)
    common.pressKey(),              // Default: snapshots disabled (false) - most key presses are minor
    common.getActiveTabForAutomation(), // Default: snapshots disabled (false) - quick lookup

    // Utility tools (no snapshot capability)
    common.wait,                    // Simple Tool - no snapshots
    common.listTabs,                // Simple Tool - no snapshots
    common.getConsoleLogs,          // Simple Tool - no snapshots
    common.screenshot,              // Simple Tool - no snapshots

    // Bulk form filling tools (using built-in defaults)
    bulk.bulkFillForm(),           // Default: snapshots enabled (true)
    bulk.discoverFormFields,       // Simple Tool - no snapshots (discovery only)
    bulk.smartFillForm(),          // Default: snapshots enabled (true)
];

const resources: Resource[] = [];

async function createServer(): Promise<Server> {
    return createServerWithTools({
    name: appConfig.name,
    version: packageJSON.version,
    tools: allTools,
    resources,
    });
}

program
    .version("Version " + packageJSON.version)
    .name(packageJSON.name)
    .action(async () => {
    const server = await createServer();
    setupExitWatchdog(server);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    });

program.parse(process.argv);