// mcp/src/extension/src/background.ts
import type { SocketMessageMap, TabInfo, SetActiveTabError } from "@/types/messages/ws.js";
import { v4 as uuidv4 } from 'uuid'; // A library for generating unique IDs, assuming it's bundled.

// ====================================================================================
// DESIGN PHILOSOPHY & WORKFLOW
// ====================================================================================
//
// PURPOSE:
// This background script is the central nervous system of the browser extension. It
// is the only component that communicates directly with the MCP server.
//
// CORE RESPONSIBILITIES:
// 1. PROTOCOL-COMPATIBLE COMMUNICATION: It implements a message receiver compatible
//    with the server's `@r2r/messaging` library. It handles request/response
//    matching using unique message IDs (`msgId`).
// 2. STATE MANAGEMENT: It holds the single most important piece of state:
//    `activeTabId`, the programmatic target for all automation.
// 3. COMMAND ROUTING: It acts as a smart router. When a request comes from the
//    server, it directs it to the correct handler—either a browser-level handler
//    within this script or by forwarding it to the content script for DOM actions.
//
// AUTOMATION WORKFLOW:
// 1. AI calls `browser_list_tabs()`.
// 2. This script returns a list of all valid, automatable tabs.
// 3. AI calls `browser_set_active_tab({ tabId: ... })`.
// 4. This script sets the internal `activeTabId`, focuses the tab, and provides
//    visual feedback.
// 5. AI calls `browser_click()`, etc. This script forwards these commands to the
//    now-active content script.
//
// ====================================================================================


// --- MODULE-LEVEL STATE ---
let mcpSocket: WebSocket | null = null;
let activeTabId: number | null = null;
const MCP_SERVER_URL = "ws://localhost:9002"; // Should be configurable.
let connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' = 'disconnected';
let wasConnected: boolean = false;

/**
 * A robust promise wrapper for asynchronous Chrome APIs that use callbacks.
 * This modernizes the API for use with async/await and centralizes error handling
 * by properly rejecting on `chrome.runtime.lastError`.
 */
function promiseChrome<T>(callback: (resolve: (value: T) => void, reject: (reason: Error) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
        callback((result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * The main message handler and router. This function is designed to be compatible
 * with the `@r2r/messaging` protocol used by the server.
 */
async function onSocketMessage(event: MessageEvent) {
    let request;
    try {
        request = JSON.parse(event.data as string);
        // All valid requests from the server's sender will have a `msgId` and `type`.
        if (!request.msgId || !request.type) return;
    } catch (e) {
        console.error("[MCP Background] Received malformed message:", event.data);
        return;
    }

    const { msgId, type, payload } = request;
    let responsePayload: any;

    try {
        switch (type) {
            case 'browser_list_tabs':
                responsePayload = await handleListTabs();
                break;
            case 'browser_set_active_tab':
                responsePayload = await handleSetActiveTab(payload.tabId, payload.focus);
                break;
            case 'browser_navigate':
            case 'browser_go_back':
            case 'browser_go_forward':
                responsePayload = await handleNavigation(type, payload);
                break;
            // Any other command type is assumed to be a DOM action for the content script.
            default:
                if (!activeTabId) {
                    throw new Error(`Action '${type}' requires an active tab. Use 'browser_list_tabs' then 'browser_set_active_tab' to select one.`);
                }
                responsePayload = await chrome.tabs.sendMessage(activeTabId, { type, payload });
                break;
        }
    } catch (e: any) {
        responsePayload = { success: false, error: { code: "BACKGROUND_SCRIPT_ERROR", message: e.message } };
    }

    // Send the response back using the protocol's expected format.
    if (mcpSocket?.readyState === WebSocket.OPEN) {
        mcpSocket.send(JSON.stringify({
            responseFor: msgId,
            payload: responsePayload,
        }));
    }
}


/**
 * Establishes and manages the WebSocket connection and its lifecycle listeners.
 */
function connect() {
    console.log(`[MCP Background] Connecting to ${MCP_SERVER_URL}...`);
    connectionStatus = 'connecting';
    sendConnectionStatusToPopup(); // Send status update
    mcpSocket = new WebSocket(MCP_SERVER_URL);

    mcpSocket.onopen = () => {
        console.log("[MCP Background] Connection established.");
        connectionStatus = 'connected';
        wasConnected = true;
        chrome.action.setIcon({ path: "icons/active.png" });
        sendConnectionStatusToPopup(); // Send status update
    };

    mcpSocket.onmessage = onSocketMessage; // Assign the robust handler

    mcpSocket.onerror = (error) => {
        console.error("[MCP Background] WebSocket error:", error);
        connectionStatus = wasConnected ? 'reconnecting' : 'disconnected';
        sendConnectionStatusToPopup(); // Send status update
    };

    mcpSocket.onclose = () => {
        console.log("[MCP Background] Connection closed. Reconnecting in 5s...");
        connectionStatus = wasConnected ? 'reconnecting' : 'disconnected';
        wasConnected = false; // Reset wasConnected on close
        chrome.action.setIcon({ path: "icons/inactive.png" });
        if (activeTabId) {
            chrome.action.setBadgeText({ text: "", tabId: activeTabId });
        }
        mcpSocket = null;
        activeTabId = null;
        sendConnectionStatusToPopup(); // Send status update
        setTimeout(connect, 5000);
    };
}

function sendConnectionStatusToPopup() {
    chrome.runtime.sendMessage({ type: 'connectionStatusUpdate', status: connectionStatus }).catch(() => {
        // Ignore errors if popup is not open
    });
}


/**
 * Fetches and returns a list of all open, automatable tabs.
 */
async function handleListTabs(): Promise<{ success: boolean; tabs: TabInfo[]; error?: string }> {
    try {
        const tabs = await promiseChrome<chrome.tabs.Tab[]>(resolve =>
            chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, resolve)
        );
        const tabInfos: TabInfo[] = tabs.map(tab => ({
            tabId: tab.id!,
            title: tab.title || 'Untitled',
            url: tab.url || 'no-url',
            isActiveForAutomation: tab.id === activeTabId,
            isActiveInWindow: tab.active,
            isAudible: tab.audible ?? false,
            isPinned: tab.pinned,
        }));
        return { success: true, tabs: tabInfos };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Sets a specific tab as the automation target and provides visual feedback.
 */
async function handleSetActiveTab(tabId: number, focus: boolean): Promise<{ success: boolean; error?: SetActiveTabError }> {
    try {
        const tab = await promiseChrome<chrome.tabs.Tab>(resolve => chrome.tabs.get(tabId, resolve));
        if (!tab || !tab.id) {
            return { success: false, error: { code: 'TAB_NOT_FOUND', message: `Tab with ID ${tabId} does not exist.` } };
        }

        if (activeTabId && activeTabId !== tab.id) {
            await promiseChrome<void>(resolve => chrome.action.setBadgeText({ text: "", tabId: activeTabId! }, resolve));
        }

        activeTabId = tab.id;
        console.log(`[MCP Background] Active automation tab set to: ${tabId}`);

        await promiseChrome<void>(resolve => chrome.action.setBadgeText({ text: "ON", tabId: activeTabId }, resolve));
        await promiseChrome<void>(resolve => chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' }, resolve));

        if (focus) {
            await promiseChrome<chrome.windows.Window>(resolve => chrome.windows.update(tab.windowId!, { focused: true }, resolve));
            await promiseChrome<chrome.tabs.Tab>(resolve => chrome.tabs.update(tab.id!, { active: true }, resolve));
        }

        return { success: true };
    } catch (e: any) {
        return { success: false, error: { code: 'CHROME_API_ERROR', message: e.message } };
    }
}

/**
 * Handles browser-level navigation commands.
 */
async function handleNavigation(
    method: 'browser_navigate' | 'browser_go_back' | 'browser_go_forward',
    params: any
): Promise<{ success: boolean; error?: string }> {
    if (!activeTabId) {
        return { success: false, error: "Navigation failed: No active tab is selected." };
    }
    try {
        if (method === 'browser_navigate') {
            await promiseChrome<chrome.tabs.Tab | undefined>(resolve => chrome.tabs.update(activeTabId!, { url: params.url }, resolve));
        } else if (method === 'browser_go_back') {
            await chrome.tabs.goBack(activeTabId);
        } else if (method === 'browser_go_forward') {
            await chrome.tabs.goForward(activeTabId);
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// --- EXTENSION LIFECYCLE LISTENERS ---
// Set initial icon state
chrome.action.setIcon({ path: "icons/inactive.png" });

chrome.runtime.onInstalled.addListener(() => connect());
chrome.runtime.onStartup.addListener(() => connect());
connect(); // Attempt initial connection immediately when the script loads.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'connect') {
        // The popup is asking to connect. The background script already auto-connects.
        // So, we just need to activate the tab if a tabId is provided.
        if (request.tabId) {
            handleSetActiveTab(request.tabId, true);
            sendResponse({ status: 'Tab activated.' });
        } else {
            sendResponse({ status: 'Already auto-connecting.' });
        }
    } else if (request.type === 'getConnectionStatus') {
        sendResponse({ status: connectionStatus });
    }
    return true; // Required for asynchronous sendResponse
});