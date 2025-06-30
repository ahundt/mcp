#!/usr/bin/env node
// ./mcp/src/index.ts
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { program } from "commander";
import { appConfig } from "@repo/config/app.config";
import type { Resource } from "@/resources/resource";
import { createServerWithTools } from "@/server";
import * as common from "@/tools/common";
import * as custom from "@/tools/custom";
import * as snapshotTools from "@/tools/snapshot";
import type { Tool } from "@/tools/tool";
import packageJSON from "../package.json";

function setupExitWatchdog(server: Server) {
    process.stdin.on("close", async () => {
    setTimeout(() => process.exit(0), 15000);
    await server.close();
    process.exit(0);
    });
}

// This list now correctly references all the tools from the updated files.

const allTools: Tool[] = [
    // Snapshot/Interaction tools
    snapshotTools.snapshot,
    snapshotTools.click,
    snapshotTools.hover,
    snapshotTools.type,
    snapshotTools.selectOption,
    snapshotTools.drag,

    // Common tools
    common.wait,
    common.pressKey,
    common.listTabs,
    common.setActiveTab,

    // Navigation tools (configured to return a snapshot)
    common.navigate(true),
    common.goBack(true),
    common.goForward(true),

    // Custom utility tools
    custom.getConsoleLogs,
    custom.screenshot,
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