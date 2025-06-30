// mcp/src/extension/src/background.ts
import type { SocketMessageMap, FocusTabError } from "@/types/messages/ws.js";

/**
 * This background script is the central communication hub.
 * 1. It maintains a single WebSocket connection to the local MCP server.
 * 2. It tracks which browser tab is the "active" target for automation via user action.
 * 3. It routes messages between the server and the correct content script.
 * 4. It handles browser-level commands that content scripts cannot.
 */

let mcpSocket: WebSocket | null = null;
let activeTabId: number | null = null;
// This URL should be configurable in a real application.
const MCP_SERVER_URL = "ws://localhost:9002"; // Default port from inspector script

/**
 * A wrapper around chrome async APIs to make them promise-based and handle errors.
 */
function promiseChrome<T>(callback: (resolve: (value: T) => void, reject: (reason?: any) => void) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        try {
            callback(resolve, reject);
        } catch (error) {
            reject(error);
        }
    });
}


/**
 * Establishes and manages the WebSocket connection to the MCP server.
 * Includes automatic reconnection logic.
 */
function connect() {
    console.log(`[MCP Background] Attempting to connect to MCP server at ${MCP_SERVER_URL}...`);
    // Use the browser's native WebSocket API.
    mcpSocket = new WebSocket(MCP_SERVER_URL);

    mcpSocket.onopen = () => {
        console.log("[MCP Background] Connection to MCP server established.");
        // Notify the user that the connection is active, e.g., by changing the icon.
        chrome.action.setIcon({ path: "/icons/active.png" }); // Assumes icons are defined in manifest
    };

    mcpSocket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleMcpRequest(message);
        } catch (e) {
            console.error("[MCP Background] Failed to parse message from MCP server:", e);
        }
    };

    mcpSocket.onerror = (error) => {
        console.error("[MCP Background] WebSocket error:", error);
    };

    mcpSocket.onclose = () => {
        console.log("[MCP Background] Connection closed. Reconnecting in 5 seconds...");
        chrome.action.setIcon({ path: "/icons/inactive.png" }); // Assumes icons are defined in manifest
        mcpSocket = null;
        activeTabId = null; // Invalidate active tab on disconnect
        setTimeout(connect, 5000);
    };
}

/**
 * Routes requests from the MCP server to the appropriate handler.
 * @param request The request object from the server.
 */
async function handleMcpRequest(request: { id: number; method: keyof SocketMessageMap; params: any }) {
    const { id, method, params } = request;
    let result: any;

    try {
        // Browser-level actions handled here in the background script.
        if (method === 'browser_navigate') {
            if (!activeTabId) throw new Error("No active tab selected.");
            await chrome.tabs.update(activeTabId, { url: params.url });
            result = { success: true }; // Navigation commands don't typically return data.
        } else if (method === 'browser_focus_tab') {
            result = await handleFocusTab();
        } else {
             // All other actions are assumed to be DOM-related and are forwarded to the content script.
            if (!activeTabId) throw new Error("No active tab selected for this action.");
            result = await chrome.tabs.sendMessage(activeTabId, { type: method, payload: params });
        }
    } catch (e: any) {
        result = { success: false, error: e.message || "An unknown error occurred in the background script." };
    }


    // Send the response back to the MCP server.
    if (mcpSocket && mcpSocket.readyState === WebSocket.OPEN) {
        // The server expects a JSON-RPC-like response with the original request ID.
        mcpSocket.send(JSON.stringify({ id, result }));
    }
}

/**
 * Handles the 'browser_focus_tab' command from the server.
 * This function must live in the background script, as content scripts cannot
 * control tabs or windows.
 * @param ws The WebSocket connection instance from the server.
 * @returns A promise resolving to the success or failure response object.
 */
async function handleFocusTab(): Promise<{ success: boolean; error?: FocusTabError }> {
    if (!activeTabId) {
        return { success: false, error: { code: 'NO_ACTIVE_CONNECTION', message: 'No tab is associated with this server connection.' } };
    }

    try {
        const tab = await promiseChrome<chrome.tabs.Tab>(resolve => chrome.tabs.get(activeTabId!, resolve));
        if (!tab) throw new Error(`Tab with ID ${activeTabId} not found.`);

        if (tab.url?.startsWith("chrome://")) {
            return { success: false, error: { code: 'FORBIDDEN_URL', message: `Cannot interact with protected URL: ${tab.url}`, url: tab.url } };
        }

        await promiseChrome<chrome.windows.Window>(resolve => chrome.windows.update(tab.windowId!, { focused: true }, resolve));
        await promiseChrome<chrome.tabs.Tab>(resolve => chrome.tabs.update(tab.id!, { active: true }, resolve));

        return { success: true };
    } catch (e: any) {
        if (e.message?.includes("No tab with id")) {
            return { success: false, error: { code: 'TAB_NOT_FOUND', message: e.message, tabId: activeTabId } };
        }
        if (e.message?.includes("No window with id")) {
            return { success: false, error: { code: 'WINDOW_NOT_FOUND', message: e.message, windowId: -1 }};
        }
        return { success: false, error: { code: 'CHROME_API_ERROR', message: e.message } };
    }
}


// Start the connection logic when the extension is installed or updated.
chrome.runtime.onStartup.addListener(connect);
connect(); // Also connect when the background script first loads.

// Listen for a user action (clicking the extension icon) to set the active tab.
chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        activeTabId = tab.id;
        console.log(`[MCP Background] Active tab for automation set to: ${tab.id}`);
        // Give visual feedback that a tab is connected.
        chrome.action.setBadgeText({ text: "ON", tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    }
});