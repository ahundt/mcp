// mcp/src/extension/src/background.ts
import type { SocketMessageMap, TabInfo, SetActiveTabError } from "@/types/messages/ws.js";
import { v4 as uuidv4 } from 'uuid';

// ====================================================================================
// DESIGN PHILOSOPHY & WORKFLOW
// ====================================================================================
// PURPOSE:
// This background script is the central nervous system of the browser extension. It
// is the only component that communicates directly with the MCP server.
//
// CORE RESPONSIBILITIES:
// 1. PROTOCOL-COMPATIBLE COMMUNICATION: It implements a message receiver compatible
//    with the server's protocol. It handles request/response matching using unique message IDs (`msgId`).
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
// LIFECYCLE & ROBUSTNESS:
// - Ensures only one WebSocket connection at a time (singleton pattern).
// - Uses exponential backoff and Chrome alarms for reconnection and recovery.
// - Idempotent initialization and listener setup.
// - Always responds to the server, even on error.
// - Provides clear logs and user feedback via badge/icon.
// ====================================================================================

// --- MODULE-LEVEL STATE ---
const MCP_SERVER_URL = "ws://localhost:9002"; // Should be configurable.
let mcpSocket: WebSocket | null = null;
let activeTabId: number | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' = 'disconnected';
let wasConnected = false;
let isConnecting = false;
let backoff = 1000;
let initialized = false;

/**
 * Updates the extension icon and badge to reflect the current connection and automation state.
 * Shows 'ON' and green badge for active automation, otherwise shows inactive icon.
 */
function updateIconAndBadge() {
    // chrome.action.setIcon({ path: connectionStatus === 'connected' ? "icons/active.svg" : "icons/inactive.svg" });
    if (activeTabId) {
        chrome.action.setBadgeText({ text: connectionStatus === 'connected' ? "ON" : "", tabId: activeTabId });
        chrome.action.setBadgeBackgroundColor({ color: connectionStatus === 'connected' ? '#4CAF50' : '#888' });
    }
}

/**
 * Sends the current connection status to the popup UI, if open.
 */
function sendConnectionStatusToPopup() {
    chrome.runtime.sendMessage({ type: 'connectionStatusUpdate', status: connectionStatus }).catch(() => {});
}

/**
 * Establishes and manages the WebSocket connection to the MCP server.
 * Handles reconnection with exponential backoff and updates state and UI accordingly.
 * Robust: will keep retrying forever, even if the server is down for a long time.
 */
function connect() {
    console.log("[MCP Background] connect() called. isConnecting:", isConnecting, "mcpSocket:", mcpSocket?.readyState);
    if (isConnecting || (mcpSocket && mcpSocket.readyState === WebSocket.OPEN)) {
        console.log("[MCP Background] connect() called but already connecting or connected.");
        return;
    }
    isConnecting = true;
    connectionStatus = 'connecting';
    updateIconAndBadge();
    sendConnectionStatusToPopup();
    try {
        mcpSocket = new WebSocket(MCP_SERVER_URL);
    } catch (e) {
        console.error("[MCP Background] Failed to create WebSocket:", e);
        isConnecting = false;
        connectionStatus = 'disconnected';
        // Always retry, even if creation fails
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
        return;
    }

    // On successful connection
    mcpSocket.onopen = () => {
        isConnecting = false;
        connectionStatus = 'connected';
        wasConnected = true;
        backoff = 1000;
        updateIconAndBadge();
        sendConnectionStatusToPopup();
        console.log("[MCP Background] Connection established.");
    };
    // On connection close, clean up and schedule reconnect
    mcpSocket.onclose = () => {
        isConnecting = false;
        connectionStatus = wasConnected ? 'reconnecting' : 'disconnected';
        wasConnected = false;
        mcpSocket = null;
        activeTabId = null;
        updateIconAndBadge();
        sendConnectionStatusToPopup();
        console.warn(`[MCP Background] Connection closed. Reconnecting in ${backoff / 1000}s...`);
        // Always retry, even if closed repeatedly
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
    };
    // On error, log and schedule reconnect
    mcpSocket.onerror = (error) => {
        isConnecting = false;
        connectionStatus = wasConnected ? 'reconnecting' : 'disconnected';
        mcpSocket = null;
        updateIconAndBadge();
        sendConnectionStatusToPopup();
        console.error("[MCP Background] WebSocket error:", error);
        // Always retry, even if error is persistent
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
    };
    // Handle incoming protocol messages
    mcpSocket.onmessage = onSocketMessage;
}

/**
 * Initializes the extension background script, ensuring idempotent setup of listeners and connection.
 * Sets up Chrome alarms for failsafe reconnection and popup communication.
 */
function initialize() {
    if (initialized) return;
    initialized = true;
    // chrome.action.setIcon({ path: "icons/inactive.svg" });
    chrome.runtime.onInstalled.addListener(connect);
    chrome.runtime.onStartup.addListener(connect);
    chrome.alarms.create('mcpHeartbeat', { periodInMinutes: 0.1 });
    chrome.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === 'mcpHeartbeat' && (!mcpSocket || mcpSocket.readyState !== WebSocket.OPEN)) connect();
    });
    connect();
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // Handle popup requests for connection or tab activation
        if (request.type === 'connect') {
            if (request.tabId) handleSetActiveTab(request.tabId, true).then(() => sendResponse({ status: 'Tab activated.' }));
            else sendResponse({ status: 'Already auto-connecting.' });
        } else if (request.type === 'getConnectionStatus') {
            sendResponse({ status: connectionStatus });
        }
        return true;
    });
}

/**
 * Main message handler and router for protocol messages from the MCP server.
 * Routes commands to browser handlers or forwards to the content script.
 * Always responds to the server, even on error.
 */
async function onSocketMessage(event: MessageEvent) {
    console.log(`[MCP Background] Received message: ${event.data}`);
    let request;
    try {
        request = JSON.parse(event.data as string);
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
                console.log("[MCP Background] Routing to handleListTabs");
                responsePayload = await handleListTabs();
                break;
            case 'browser_set_active_tab':
                console.log("[MCP Background] Routing to handleSetActiveTab");
                responsePayload = await handleSetActiveTab(payload.tabId, payload.focus);
                break;
            case 'browser_navigate':
            case 'browser_go_back':
            case 'browser_go_forward':
                console.log(`[MCP Background] Routing to handleNavigation with type: ${type}`);
                responsePayload = await handleNavigation(type, payload);
                break;
            default:
                if (!activeTabId) {
                    throw new Error(`Action '${type}' requires an active tab. Use 'browser_list_tabs' then 'browser_set_active_tab' to select one.`);
                }
                // Forward DOM action to content script in the active tab
                responsePayload = await chrome.tabs.sendMessage(activeTabId, { type, payload });
                break;
        }
    } catch (e: any) {
        responsePayload = { success: false, error: { code: "BACKGROUND_SCRIPT_ERROR", message: e.message } };
        console.error(`[MCP Background] Error handling message type '${type}':`, e);
    }
    if (mcpSocket?.readyState === WebSocket.OPEN) {
        mcpSocket.send(JSON.stringify({ responseFor: msgId, payload: responsePayload }));
    }
}

/**
 * Promise wrapper for Chrome callback APIs, with error handling for lastError.
 * @param callback - Chrome API call with resolve/reject arguments.
 */
function promiseChrome<T>(callback: (resolve: (value: T) => void, reject: (reason: Error) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
        callback(
            (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            },
            (err) => reject(err)
        );
    });
}

/**
 * Returns a list of all open, automatable tabs for the current user session.
 * Used by the AI to select a tab for automation.
 */
async function handleListTabs(): Promise<{ success: boolean; tabs: TabInfo[]; error?: string }> {
    try {
        const tabs = await promiseChrome<chrome.tabs.Tab[]>((resolve, reject) =>
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
        console.error("[MCP Background] Error in handleListTabs:", e);
        return { success: false, tabs: [], error: e.message };
    }
}

/**
 * Sets a specific tab as the automation target and provides visual feedback.
 * Optionally focuses the tab and its window.
 */
async function handleSetActiveTab(tabId: number, focus: boolean): Promise<{ success: boolean; error?: SetActiveTabError }> {
    try {
        const tab = await promiseChrome<chrome.tabs.Tab>((resolve, reject) => chrome.tabs.get(tabId, resolve));
        if (!tab || !tab.id) {
            return { success: false, error: { code: 'TAB_NOT_FOUND', message: `Tab with ID ${tabId} does not exist.` } };
        }
        // Clear badge from previous active tab
        if (activeTabId && activeTabId !== tab.id) {
            await promiseChrome<void>((resolve, reject) => chrome.action.setBadgeText({ text: "", tabId: activeTabId! }, resolve));
        }
        activeTabId = tab.id;
        console.log(`[MCP Background] Active automation tab set to: ${tabId}`);
        // Set badge and color for new active tab
        await promiseChrome<void>((resolve, reject) => chrome.action.setBadgeText({ text: "ON", tabId: activeTabId! }, resolve));
        await promiseChrome<void>((resolve, reject) => chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' }, resolve));
        // Optionally focus the tab and window
        if (focus) {
            await promiseChrome<chrome.windows.Window>((resolve, reject) => chrome.windows.update(tab.windowId!, { focused: true }, resolve));
            await promiseChrome<chrome.tabs.Tab | undefined>((resolve, reject) => chrome.tabs.update(tab.id!, { active: true }, resolve));
        }
        return { success: true };
    } catch (e: any) {
        console.error("[MCP Background] Error in handleSetActiveTab:", e);
        return { success: false, error: { code: 'CHROME_API_ERROR', message: e.message } };
    }
}

/**
 * Handles browser-level navigation commands (navigate, go back, go forward).
 * Returns success or error for the navigation attempt.
 */
async function handleNavigation(
    method: 'browser_navigate' | 'browser_go_back' | 'browser_go_forward',
    params: any
): Promise<{ success: boolean; error?: string }> {
    console.log(`[MCP Background] Inside handleNavigation with method: ${method} and params: ${JSON.stringify(params)}`);
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
        console.error(`[MCP Background] Error in handleNavigation (${method}):`, e);
        return { success: false, error: e.message };
    }
}

initialize();