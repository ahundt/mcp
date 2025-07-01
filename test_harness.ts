/**
 * MCP Test Harness (Persistent Version)
 * -------------------------------------
 * - Launches the MCP server and communicates via stdio or WebSocket.
 * - Periodically sends a browser_list_tabs command, logs all sent/received messages, and tracks message count, rate, uptime, and round-trip time.
 * - Remains running until interrupted (SIGINT) or a fatal error occurs.
 * - Cleans up all resources on exit.
 * - Easy to extend for new commands or interactive input.
 */

import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import readline from 'readline';

const MCP_SERVER_URL = 'ws://localhost:9002';
const SERVER_START_COMMAND = 'node';
const SERVER_START_ARGS = ['dist/index.js'];
const TRANSPORT = process.env.MCP_TRANSPORT === 'websocket' ? 'websocket' : 'stdio';
const STATUS_INTERVAL_MS = 10000;

// --- Transport Abstraction ---
type MessageHandler = (msg: any, raw: string) => void;

interface HarnessTransport {
    send(msg: object): void;
    onMessage(cb: MessageHandler): void;
    close(): void;
}

/**
 * STDIO Transport: communicates with the MCP server via stdio (default)
 */
class StdioTransport implements HarnessTransport {
    private rl: readline.Interface;
    private proc: ChildProcess;
    private messageHandler: MessageHandler = () => {};
    constructor(proc: ChildProcess) {
        this.proc = proc;
        this.rl = readline.createInterface({
            input: proc.stdout!,
            output: proc.stdin!,
            terminal: false
        });
        this.rl.on('line', (line) => {
            let parsed: any = null;
            try { parsed = JSON.parse(line); } catch {}
            this.messageHandler(parsed, line);
        });
    }
    send(msg: object) {
        if (!this.proc || this.proc.exitCode !== null) {
            console.error('[Harness] Cannot send command: server process is not running.');
            return;
        }
        this.proc.stdin!.write(JSON.stringify(msg) + '\n');
    }
    onMessage(cb: MessageHandler) { this.messageHandler = cb; }
    close() { this.rl.close(); }
}

/**
 * WebSocket Transport: communicates with the MCP server via WebSocket
 */
class WebSocketTransport implements HarnessTransport {
    public ws: WebSocket;
    private messageHandler: MessageHandler = () => {};
    constructor(url: string) {
        this.ws = new WebSocket(url);
        this.ws.on('message', (data) => {
            let parsed: any = null;
            try { parsed = JSON.parse(data.toString()); } catch {}
            this.messageHandler(parsed, data.toString());
        });
    }
    send(msg: object) {
        if (this.ws.readyState === 1) {
            this.ws.send(JSON.stringify(msg));
        } else {
            console.error('[Harness] Cannot send command: WebSocket not open.');
        }
    }
    onMessage(cb: MessageHandler) { this.messageHandler = cb; }
    close() { this.ws.close(); }
}

function wait(ms: number) {
    return new Promise(res => setTimeout(res, ms));
}

/**
 * Main test harness logic
 */
async function runTest() {
    let serverProcess: ChildProcess | null = null;
    let transport: HarnessTransport | null = null;
    let startTime = Date.now();
    let lastSendTime = 0;
    let lastRecvTime = 0;
    let messageCount = 0;
    let connectionType = 'unknown';
    let clientType = 'unknown';

    // Clean up server and transport on exit
    const cleanup = () => {
        if (transport) transport.close();
        if (serverProcess && serverProcess.exitCode === null) {
            console.log(`\n[Harness] Terminating server process (PID: ${serverProcess.pid})...`);
            serverProcess.kill('SIGINT');
            console.log('[Harness] Server process terminated.');
        }
        process.exit(0);
    };
    process.on('SIGINT', cleanup);

    try {
        // Launch the MCP server
        console.log('[Harness] Launching MCP server...');
        serverProcess = spawn(SERVER_START_COMMAND, SERVER_START_ARGS, { cwd: process.cwd() });
        console.log(`[Harness] Server launched with PID: ${serverProcess.pid}`);
        serverProcess.stdout?.on('data', (data) => {
            const line = data.toString().trim();
            console.log(`[Server STDOUT] ${line}`);
            if (line.includes('WebSocket client connected')) connectionType = 'websocket';
            if (line.includes('StdioServerTransport')) connectionType = 'stdio';
            if (line.toLowerCase().includes('chrome')) clientType = 'chrome-extension';
            if (line.toLowerCase().includes('client')) clientType = 'other-client';
        });
        serverProcess.stderr?.on('data', (data) => {
            console.error(`[Server STDERR] ${data.toString().trim()}`);
        });
        serverProcess.on('close', (code) => {
            console.log(`[Harness] Server process exited with code ${code}.`);
        });
        console.log('[Harness] Waiting for server to initialize...');
        await wait(3000);

        // Setup transport
        transport = TRANSPORT === 'websocket'
            ? new WebSocketTransport(MCP_SERVER_URL)
            : new StdioTransport(serverProcess);

        // Handle all incoming messages
        transport.onMessage((parsed, raw) => {
            lastRecvTime = Date.now();
            messageCount++;
            if (parsed) {
                console.log('[Harness] Received result:');
                console.dir(parsed, { depth: null, colors: true });
            } else {
                console.log(`[Harness] Received: ${raw}`);
            }
            const roundTrip = (lastRecvTime - lastSendTime) / 1000;
            const totalElapsed = (lastRecvTime - startTime) / 1000;
            const rate = messageCount / (totalElapsed || 1);
            console.log(`[Harness] Round-trip: ${roundTrip.toFixed(3)}s, Elapsed: ${totalElapsed.toFixed(3)}s, Msg count: ${messageCount}, Rate: ${rate.toFixed(2)} msg/s`);
        });

        // Persistent async loop for periodic command sending and status logging
        while (true) {
            const now = Date.now();
            const totalElapsed = (now - startTime) / 1000;
            const rate = messageCount / (totalElapsed || 1);

            // Log status
            if (TRANSPORT === 'websocket') {
                console.log(`[Harness Status] WebSocket, Connection: ${connectionType}, Client: ${clientType}, Msg count: ${messageCount}, Rate: ${rate.toFixed(2)} msg/s, Uptime: ${totalElapsed.toFixed(1)}s`);
            } else {
                console.log(`[Harness Status] STDIO, Msg count: ${messageCount}, Rate: ${rate.toFixed(2)} msg/s, Uptime: ${totalElapsed.toFixed(1)}s`);
            }

            // Only send command if connection is open
            let canSend = false;
            if (TRANSPORT === 'websocket' && (transport as any).ws?.readyState === 1) canSend = true;
            if (TRANSPORT === 'stdio' && serverProcess && serverProcess.exitCode === null) canSend = true;

            if (canSend) {
                const cmd = TRANSPORT === 'websocket' ? {
                    msgId: uuidv4(),
                    type: 'browser_list_tabs',
                    payload: {}
                } : {
                    id: uuidv4(),
                    jsonrpc: '2.0',
                    method: 'callTool',
                    params: {
                        name: 'browser_list_tabs',
                        arguments: {}
                    }
                };
                lastSendTime = Date.now();
                transport.send(cmd);
                console.log(`[Harness] Sent command: ${JSON.stringify(cmd)}`);
            } else {
                console.log('[Harness] Not connected, skipping command send.');
            }

            await wait(STATUS_INTERVAL_MS);
        }
    } catch (error) {
        console.error(`[Harness] An unexpected error occurred: ${error}`);
    } finally {
        cleanup();
    }
}

runTest();