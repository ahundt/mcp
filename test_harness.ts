/**
 * MCP Test Harness (SDK-First, Smart Process Management, Optional Interactive Mode)
 * --------------------------------------------------------------------------------
 * - Launches the MCP server and communicates via stdio or WebSocket using the MCP SDK Client API.
 * - Periodically sends a browser_list_tabs command, logs all sent/received messages, and tracks message count, rate, uptime, and round-trip time.
 * - Optional interactive CLI mode for sending custom tool/resource commands (enable with MCP_INTERACTIVE=1).
 * - Remains running until interrupted (SIGINT) or a fatal error occurs.
 * - Cleans up all resources on exit.
 * - Easy to extend for new commands, scripting, or Inspector/automation hooks.
 *
 * Design & Reasoning:
 * - Uses the official MCP SDK Client API for protocol compliance and future-proofing.
 * - Lets the SDK manage the server process for stdio, or launches the server for WebSocket if needed.
 * - Retains all robust logging, status, and persistent loop features from previous versions.
 * - Optional interactive CLI mode for advanced/manual control.
 * - All code is modular, readable, and well-documented for maintainability and extensibility.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import readline from "readline";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "ws://localhost:9002";
const TRANSPORT = process.env.MCP_TRANSPORT === "websocket" ? "websocket" : "stdio";
const INTERACTIVE = process.env.MCP_INTERACTIVE === "1";
const STATUS_INTERVAL_MS = 10000;
const NAVIGATE_ON_START = process.env.MCP_NAVIGATE_ON_START !== "0"; // default true
const TEST_PAGE_URL = "https://www.roboform.com/filling-test-all-fields";

/**
 * Wait helper for async timing.
 */
function wait(ms: number) {
    return new Promise(res => setTimeout(res, ms));
}

/**
 * Helper to navigate to the test page.
 * @param client - The MCP client instance
 * @returns Promise<any> - The navigation result from the MCP tool
 */
async function navigateToTestPage(client: Client): Promise<any> {
    try {
        console.log(`[Harness] Navigating to test page: ${TEST_PAGE_URL}`);
        const navResult = await client.callTool({
            name: "browser_navigate",
            arguments: { url: TEST_PAGE_URL }
        });
        console.log("[Harness] Navigation result:");
        console.dir(navResult, { depth: null, colors: true });
        return navResult; // Explicitly return the result
    } catch (err) {
        console.error("[Harness] Navigation failed:", err);
        return { error: err }; // Return error object instead of undefined
    }
}

/**
 * Main test harness logic (SDK-First, Smart Process Management, Optional Interactive Mode)
 */
async function runTest() {
    let client: Client | null = null;
    let transport: any;
    let messageCount = 0;
    let startTime = Date.now();
    let lastSendTime = 0;
    let lastRecvTime = 0;
    let connectionType = TRANSPORT;
    let clientType = "test-harness";
    let running = true;

    // Clean up client and transport on exit
    const cleanup = async () => {
        running = false;
        // No client.disconnect() in SDK; just stop loop and exit
        process.exit(0);
    };
    process.on("SIGINT", cleanup);

    try {
        // --- Transport and Client Setup ---
        if (TRANSPORT === "websocket") {
            // Optionally, launch the server externally if not already running
            transport = new WebSocketClientTransport(new URL(MCP_SERVER_URL));
        } else {
            // Let the SDK manage the server process for stdio
            transport = new StdioClientTransport({
                command: "node",
                args: ["dist/index.js"]
            });
        }
        client = new Client({ name: "test-harness", version: "1.0.0" });
        await client.connect(transport);
        console.log(`[Harness] Connected to MCP server via ${TRANSPORT}`);

        // --- Optional Interactive CLI Mode ---
        if (INTERACTIVE) {
            console.log("[Harness] Interactive CLI mode enabled. Type 'tool <name>' to call a tool, 'navigate' to go to the test page, or 'exit' to quit.");
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            rl.on("line", async (line) => {
                const [cmd, ...args] = line.trim().split(" ");
                if (cmd === "exit") {
                    await cleanup();
                } else if (cmd === "tool" && args[0]) {
                    try {
                        const result = await client!.callTool({ name: args[0], arguments: {} });
                        console.dir(result, { depth: null, colors: true });
                    } catch (err) {
                        console.error(`[Harness] Tool call failed:`, err);
                    }
                } else if (cmd === "navigate") {
                    await navigateToTestPage(client!);
                } else {
                    console.log("[Harness] Unknown command. Use 'tool <name>', 'navigate', or 'exit'.");
                }
            });
        }

        let hasNavigated = false;
        let successfullyListedTabs = false;
        // --- Persistent async loop for periodic command sending and status logging ---
        while (running) {
            const now = Date.now();
            const totalElapsed = (now - startTime) / 1000;
            const rate = messageCount / (totalElapsed || 1);
            // Log status
            console.log(`[Harness Status] ${TRANSPORT}, Client: ${clientType}, Msg count: ${messageCount}, Rate: ${rate.toFixed(2)} msg/s, Uptime: ${totalElapsed.toFixed(1)}s`);
            // Send browser_list_tabs command
            try {
                // -- Send the list tabs command and measure round-trip time ---
                lastSendTime = Date.now();
                const result = await client.callTool({ name: "browser_list_tabs", arguments: {} });
                lastRecvTime = Date.now();
                messageCount++;
                const roundTrip = (lastRecvTime - lastSendTime) / 1000;
                console.log(`[Harness] Received result:`);
                console.dir(result, { depth: null, colors: true });
                console.log(`[Harness] Round-trip: ${roundTrip.toFixed(3)}s, Elapsed: ${totalElapsed.toFixed(3)}s, Msg count: ${messageCount}, Rate: ${rate.toFixed(2)} msg/s`);

                // -- Check if the result contains tabs and if any are active for automation --

                // -- Get active automation tab safely (may create new tab if needed) --
                const activeTabResult = await client.callTool({
                    name: "browser_get_active_tab_for_automation",
                    arguments: { newWindow: 'on-no-automation-tab' } // Safe default: only create if needed
                });
                console.log("[Harness] Active tab info:");
                console.dir(activeTabResult, { depth: null, colors: true });

                // Set sucessfullyListedTabs only if no error in result
                successfullyListedTabs = !(result && result.isError) && !(activeTabResult && activeTabResult.isError);

                // Navigate to the test page after ensuring we have a safe automation tab
                if (successfullyListedTabs && NAVIGATE_ON_START && !hasNavigated) {
                    console.log(`[Harness] Successfully ensured automation tab, navigating to test page: ${TEST_PAGE_URL}`);
                    const navigateResult = await navigateToTestPage(client);
                    // print the test page data
                    console.log("[Harness] Test page navigation result:");
                    console.dir(navigateResult, { depth: null, colors: true });
                    hasNavigated = true;
                }
            } catch (err) {
                console.error(`[Harness] MCP call failed:`, err);
            }
            await wait(STATUS_INTERVAL_MS);
        }
    } catch (error) {
        console.error(`[Harness] An unexpected error occurred:`, error);
        await cleanup();
    }
}

runTest();