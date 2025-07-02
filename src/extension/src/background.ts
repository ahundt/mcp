// mcp/src/extension/src/background.ts
import type { SocketMessageMap, TabInfo, SetActiveTabError } from "@/types/messages/ws.js";
import { v4 as uuidv4 } from 'uuid';

// ====================================================================================
// DESIGN PHILOSOPHY & WORKFLOW
// ====================================================================================
// PURPOSE:
// This background script is the central nervous system of the browser extension. It
// is the only component that communicates directly with the MCP server. It always
// runs in the background of the browser, even when the popup UI is closed.
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
//
// CONNECTION STATE MACHINE:
//
// ┌──────────────┐
// │disconnected  │
// └─────┬────────┘
//       │ (user clicks connect or autoConnect)
//       ▼
// ┌──────────────┐
// │ connecting   │
// └─────┬────────┘
//       │ (WebSocket open)
//       ▼
// ┌──────────────┐
// │  connected   │
// └─────┬────────┘
//       │ (user clicks disconnect)
//       ▼
// ┌──────────────┐
// │disconnecting │
// └─────┬────────┘
//       │ (socket closed)
//       ▼
// ┌──────────────┐
// │disconnected  │
// └─────┬────────┘
//       │ (unexpected close/error)
//       ▼
// ┌──────────────┐
// │reconnecting  │
// └─────┬────────┘
//       │ (WebSocket open)
//       ▼
// ┌──────────────┐
// │  connected   │
// └──────────────┘
//
// - Only connect in 'connecting' or 'reconnecting' states (see: connect())
// - Only disconnect in 'connected' or 'connecting' states (see: disconnectFromMcpServer())
// - UI and popup always reflect current state (see: updateIconAndBadge(), sendConnectionStatusToPopup())
// - Protocol-initiated disconnect handled in onSocketMessage()
// - State variables: background.ts, module-level state
// - connect(): background.ts, connection logic
// - disconnectFromMcpServer(): background.ts, disconnect logic
// - UI update: updateIconAndBadge(), sendConnectionStatusToPopup()
// - Protocol handler: onSocketMessage()
// ====================================================================================

// --- MODULE-LEVEL STATE ---
const MCP_SERVER_URL = "ws://localhost:9002"; // Should be configurable.
let mcpSocket: WebSocket | null = null;
let activeTabId: number | null = null;
let connectionStatus: 'disconnected' | 'disconnecting' | 'connecting' | 'connected' | 'reconnecting' = 'disconnected';
let wasConnected = false;
let isConnecting = false;
let backoff = 1000;
let initialized = false;
const autoConnectOnStartup = false; // Set to true to auto-connect on startup
let shouldReconnect = true; // Controls whether to reconnect on socket close

// --- Connection State Machine Events ---
type ConnectionEvent =
  | 'USER_CONNECT'
  | 'USER_DISCONNECT'
  | 'SOCKET_OPEN'
  | 'SOCKET_CLOSE'
  | 'SOCKET_ERROR'
  | 'PROTOCOL_DISCONNECT';

function transitionConnectionStatus(
  current: typeof connectionStatus,
  event: ConnectionEvent
): typeof connectionStatus {
  switch (current) {
    case 'disconnected':
      if (event === 'USER_CONNECT') return 'connecting';
      return current;
    case 'connecting':
      if (event === 'SOCKET_OPEN') return 'connected';
      if (event === 'USER_DISCONNECT' || event === 'PROTOCOL_DISCONNECT') return 'disconnecting';
      if (event === 'SOCKET_ERROR' || event === 'SOCKET_CLOSE') return 'reconnecting';
      return current;
    case 'connected':
      if (event === 'USER_DISCONNECT' || event === 'PROTOCOL_DISCONNECT') return 'disconnecting';
      if (event === 'SOCKET_ERROR' || event === 'SOCKET_CLOSE') return 'reconnecting';
      return current;
    case 'disconnecting':
      if (event === 'SOCKET_CLOSE') return 'disconnected';
      return current;
    case 'reconnecting':
      if (event === 'SOCKET_OPEN') return 'connected';
      if (event === 'USER_DISCONNECT' || event === 'PROTOCOL_DISCONNECT') return 'disconnecting';
      return current;
    default:
      return current;
  }
}

function setConnectionStatus(event: ConnectionEvent) {
  const prev = connectionStatus;
  const next = transitionConnectionStatus(connectionStatus, event);
  if (prev !== next) {
    connectionStatus = next;
    updateIconAndBadge();
    sendConnectionStatusToPopup();
    console.log(`[MCP] State: ${prev} -> ${next} via ${event}`);
  }
}

/**
 * Cleanly disconnects from the MCP server, closes the socket, updates status, and notifies UI.
 * Can be called from UI, protocol, or error handlers.
 */
function disconnectFromMcpServer(reason = "User requested disconnect") {
    if (
        connectionStatus !== 'connected' &&
        connectionStatus !== 'connecting' &&
        connectionStatus !== 'reconnecting'
    ) {
        console.log('[MCP] disconnect called but not in connected/connecting/reconnecting state.');
        return;
    }
    setConnectionStatus('USER_DISCONNECT');
    shouldReconnect = false; // Prevent reconnect on this close
    if (mcpSocket && mcpSocket.readyState === WebSocket.OPEN) {
        try {
            mcpSocket.send(JSON.stringify({ type: 'disconnect' })); // Optionally notify server
        } catch (e) { /* ignore */ }
        mcpSocket.close(1000, reason);
    } else {
        setConnectionStatus('SOCKET_CLOSE');
    }
}

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
    // Only allow connect in correct states
    if (connectionStatus !== 'connecting' && connectionStatus !== 'reconnecting') {
        console.log('[MCP] connect() called but not in connecting or reconnecting state.');
        return;
    }
    updateIconAndBadge();
    sendConnectionStatusToPopup();
    try {
        mcpSocket = new WebSocket(MCP_SERVER_URL);
    } catch (e) {
        console.error("[MCP Background] Failed to create WebSocket:", e);
        isConnecting = false;
        setConnectionStatus('SOCKET_ERROR');
        // Always retry, even if creation fails
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
        return;
    }

    // On successful connection
    mcpSocket.onopen = () => {
        isConnecting = false;
        setConnectionStatus('SOCKET_OPEN');
        wasConnected = true;
        backoff = 1000;
        console.log("[MCP Background] Connection established.");
    };
    // On connection close, clean up and schedule reconnect
    mcpSocket.onclose = () => {
        isConnecting = false;
        setConnectionStatus('SOCKET_CLOSE');
        wasConnected = false;
        mcpSocket = null;
        activeTabId = null;
        if (!shouldReconnect) {
            shouldReconnect = true; // Reset for next connection
            backoff = 1000;
            return; // Do not reconnect after user/protocol disconnect
        }
        console.warn(`[MCP Background] Connection closed. Reconnecting in ${backoff / 1000}s...`);
        setTimeout(() => {
            setConnectionStatus('SOCKET_ERROR');
            connect();
        }, backoff);
        backoff = Math.min(backoff * 2, 30000);
    };
    // On error, log and schedule reconnect
    mcpSocket.onerror = (error) => {
        isConnecting = false;
        setConnectionStatus('SOCKET_ERROR');
        mcpSocket = null;
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
    chrome.runtime.onInstalled.addListener(() => {
        setConnectionStatus('SOCKET_CLOSE');
    });
    chrome.runtime.onStartup.addListener(() => {
        setConnectionStatus('SOCKET_CLOSE');
    });
    chrome.alarms.create('mcpHeartbeat', { periodInMinutes: 0.1 });
    chrome.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === 'mcpHeartbeat' && (!mcpSocket || mcpSocket.readyState !== WebSocket.OPEN)) {
            if (connectionStatus === 'connecting' || connectionStatus === 'reconnecting') {
                connect();
            }
        }
    });
    // Do not auto-connect on startup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // Handle popup requests for connection or tab activation
        if (request.type === 'connect') {
            setConnectionStatus('USER_CONNECT');
            if (connectionStatus === 'connecting') connect();
            if (request.tabId) handleSetActiveTab(request.tabId, true).then(() => sendResponse({ status: 'Tab activated.' }));
            else sendResponse({ status: 'Connecting...' });
        } else if (request.type === 'getConnectionStatus') {
            sendResponse({ status: connectionStatus });
        } else if (request.type === 'disconnect') {
            setConnectionStatus('USER_DISCONNECT');
            disconnectFromMcpServer();
            sendResponse({ status: 'disconnecting' });
            return true;
        }
        return true;
    });

    if (autoConnectOnStartup && connectionStatus === 'disconnected') {
        setConnectionStatus('USER_CONNECT');
        connect();
    }
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
    console.log(`[MCP Background] Handling message type: ${type}, payload:`, payload);
    let responsePayload: any;
    try {
        switch (type) {
            case 'browser_list_tabs':
                console.log("[MCP Background] Routing to handleListTabs");
                responsePayload = await handleListTabs();
                break;
            case 'browser_set_active_tab':
                console.log(`[MCP Background] Routing to handleSetActiveTab with tabId: ${payload?.tabId}, focus: ${payload?.focus}`);
                responsePayload = await handleSetActiveTab(payload.tabId, payload.focus);
                break;
            case 'browser_get_active_tab_for_automation':
                console.log(`[MCP Background] Routing to handleGetActiveTabForAutomation with newWindow: ${payload?.newWindow || 'on-no-automation-tab'}`);
                responsePayload = await handleGetActiveTabForAutomation(payload?.newWindow);
                break;
            case 'browser_navigate':
            case 'browser_go_back':
            case 'browser_go_forward':
                console.log(`[MCP Background] Routing to handleNavigation with type: ${type}`);
                responsePayload = await handleNavigation(type, payload);
                break;
            case 'browser_snapshot': {
                responsePayload = await handleBrowserSnapshot(payload);
                break;
            }
            case 'server_disconnect':
                setConnectionStatus('PROTOCOL_DISCONNECT');
                disconnectFromMcpServer('Server requested disconnect');
                responsePayload = { success: true, message: 'Disconnected by server request.' };
                break;
            default:
                if (!activeTabId) {
                    console.warn(`[MCP Background] No activeTabId set. Cannot handle action: ${type}`);
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
    console.log(`[MCP Background] handleSetActiveTab called with tabId: ${tabId}, focus: ${focus}`);
    try {
        const tab = await promiseChrome<chrome.tabs.Tab>((resolve, reject) => chrome.tabs.get(tabId, resolve));
        if (!tab || !tab.id) {
            // Defensive: Tab may have closed between list and set
            console.warn(`[MCP Background] Tab with ID ${tabId} does not exist.`);
            return { success: false, error: { code: 'TAB_NOT_FOUND', message: `Tab with ID ${tabId} does not exist.` } };
        }
        // Clear badge from previous active tab, if any
        if (activeTabId && activeTabId !== tab.id) {
            await promiseChrome<void>((resolve, reject) => chrome.action.setBadgeText({ text: "", tabId: activeTabId! }, resolve));
        }
        // Set new active tab
        activeTabId = tab.id;
        // Visual feedback: badge and color
        await promiseChrome<void>((resolve, reject) => chrome.action.setBadgeText({ text: "ON", tabId: activeTabId! }, resolve));
        await promiseChrome<void>((resolve, reject) => chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' }, resolve));
        // Optionally focus the tab and its window for user clarity
        if (focus) {
            await promiseChrome<chrome.windows.Window>((resolve, reject) => chrome.windows.update(tab.windowId!, { focused: true }, resolve));
            await promiseChrome<chrome.tabs.Tab | undefined>((resolve, reject) => chrome.tabs.update(tab.id!, { active: true }, resolve));
        }
        console.log(`[MCP Background] handleSetActiveTab succeeded for tabId: ${tabId}`);
        return { success: true };
    } catch (e: any) {
        // Robust error handling: always return a protocol-compliant error envelope
        console.error("[MCP Background] Error in handleSetActiveTab:", e);
        return { success: false, error: { code: 'CHROME_API_ERROR', message: e.message } };
    }
}

/**
 * Returns the TabInfo for the current automation tab (activeTabId), with safe new tab creation.
 *
 * SAFETY FEATURES:
 * - Never automatically converts user tabs to automation tabs
 * - Only returns tabs explicitly marked as automation tabs (activeTabId)
 * - Can create safe new tabs when no automation tab exists
 *
 * NEW WINDOW BEHAVIOR:
 * - 'always': Always create a new automation tab
 * - 'on-no-automation-tab': Create new tab only if no automation tab exists (DEFAULT, SAFEST)
 * - 'never': Fail with clear error if no automation tab exists
 *
 * Best practices:
 * - Always returns a protocol envelope: { success, tab?, error?, wasNewTabCreated? }
 * - Defensive: Handles missing/closed tabs gracefully
 * - DRY: Uses the same TabInfo shape as handleListTabs
 * - Clear logging for diagnostics and safety
 *
 * @param newWindow - Controls new window creation behavior
 */
async function handleGetActiveTabForAutomation(
    newWindow: 'always' | 'on-no-automation-tab' | 'never' = 'on-no-automation-tab'
): Promise<{ success: boolean; tab?: TabInfo; error?: string; wasNewTabCreated?: boolean }> {
    console.log(`[MCP Background] handleGetActiveTabForAutomation called with newWindow: ${newWindow}`);

    try {
        let tab: chrome.tabs.Tab | undefined;
        let wasNewTabCreated = false;

        // Check if we have a valid automation tab
        if (activeTabId) {
            try {
                tab = await promiseChrome<chrome.tabs.Tab>((resolve, reject) => chrome.tabs.get(activeTabId!, resolve));
                console.log(`[MCP Background] Found existing automation tab: ${activeTabId}`);
            } catch (e) {
                console.warn(`[MCP Background] Automation tab ${activeTabId} no longer exists, clearing activeTabId`);
                activeTabId = null; // Clear invalid tab reference
            }
        }

        // Handle new tab creation based on policy
        if (!tab && newWindow !== 'never') {
            if (newWindow === 'always' || (newWindow === 'on-no-automation-tab' && !activeTabId)) {
                console.log(`[MCP Background] Creating new automation tab (policy: ${newWindow})`);
                try {
                    // Create a safe automation tab with a neutral URL
                    tab = await promiseChrome<chrome.tabs.Tab>((resolve, reject) =>
                        chrome.tabs.create({
                            url: 'about:blank',
                            active: false // Don't disrupt user's current tab
                        }, resolve)
                    );

                    if (tab && tab.id) {
                        activeTabId = tab.id;
                        wasNewTabCreated = true;
                        console.log(`[MCP Background] Created new automation tab: ${activeTabId}`);

                        // Set visual feedback for the new automation tab
                        await promiseChrome<void>((resolve, reject) => chrome.action.setBadgeText({ text: "ON", tabId: activeTabId! }, resolve));
                        await promiseChrome<void>((resolve, reject) => chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' }, resolve));
                    }
                } catch (e: any) {
                    console.error('[MCP Background] Failed to create new automation tab:', e);
                    return { success: false, error: `Failed to create new automation tab: ${e.message}` };
                }
            }
        }

        // Final validation
        if (!tab || !tab.id) {
            const errorMsg = newWindow === 'never'
                ? 'No automation tab available and new tab creation is disabled (newWindow: never)'
                : 'No automation tab available and failed to create new tab';
            console.warn(`[MCP Background] ${errorMsg}`);
            return { success: false, error: errorMsg };
        }

        // Construct TabInfo (keep in sync with TabInfoSchema/type)
        const tabInfo: TabInfo = {
            tabId: tab.id!,
            title: tab.title || 'Untitled',
            url: tab.url || 'about:blank',
            isActiveForAutomation: tab.id === activeTabId, // Only true for our automation tab
            isActiveInWindow: tab.active,
            isAudible: tab.audible ?? false,
            isPinned: tab.pinned,
        };

        console.log(`[MCP Background] Returning automation tab info:`, tabInfo);
        return { success: true, tab: tabInfo, wasNewTabCreated };
    } catch (e: any) {
        // Robust error handling
        console.error('[MCP Background] Error in handleGetActiveTabForAutomation:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Handles browser-level navigation commands (navigate, go back, go forward).
 *
 * Best practices:
 * - Requires an active automation tab (activeTabId).
 * - Always returns a protocol envelope: { success, error? }
 * - Logs all actions and errors for diagnostics.
 * - Uses promiseChrome for robust Chrome API error handling.
 *
 * @param method - One of 'browser_navigate', 'browser_go_back', 'browser_go_forward'.
 * @param params - Parameters for navigation (e.g., { url })
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

/**
 * Handles the 'browser_snapshot' protocol command with safe automation tab handling.
 * This function is responsible for:
 *   - Determining the correct tab to snapshot (automation tab only, safe new tab creation)
 *   - Sending the snapshot request to the content script in that tab
 *   - Returning a protocol-compliant result envelope, including the tab info used
 *   - Providing robust error handling and clear logging for maintainability
 *
 * SAFETY FEATURES:
 *   - Only uses tabs explicitly marked for automation (activeTabId)
 *   - Can safely create new automation tabs if none exist
 *   - Never interferes with user's personal browsing tabs
 *
 * Best Practices:
 *   - Always include the result of handleGetActiveTabForAutomation in the response for traceability
 *   - Never throw unhandled errors; always return a protocol-compliant error envelope
 *   - Keep this function pure and side-effect free except for messaging
 *   - Log all key decisions and errors for debugging and maintainability
 *
 * @param payload - The payload for the snapshot command (may include newWindow parameter)
 * @returns A protocol result envelope containing the snapshot and tab info, or an error
 */
async function handleBrowserSnapshot(payload: any): Promise<any> {
    // Use safe tab resolution with potential new tab creation
    const newWindow = payload?.newWindow || 'on-no-automation-tab'; // Safe default
    console.log(`[MCP Background] handleBrowserSnapshot called with newWindow: ${newWindow}`);

    const tabInfoResult = await handleGetActiveTabForAutomation(newWindow);

    if (!tabInfoResult.success || !tabInfoResult.tab) {
        const errorMsg = tabInfoResult.error || 'No automation tab available for snapshot';
        console.warn(`[MCP Background] handleBrowserSnapshot: ${errorMsg}`);
        return { success: false, error: { code: 'NO_AUTOMATION_TAB', message: errorMsg }, activeTab: tabInfoResult };
    }

    const tabIdToUse = tabInfoResult.tab.tabId;
    console.log(`[MCP Background] handleBrowserSnapshot: Using automation tabId: ${tabIdToUse}${tabInfoResult.wasNewTabCreated ? ' (newly created)' : ''}`);

    try {
        // Send the snapshot request to the content script in the automation tab
        const snapshot = await chrome.tabs.sendMessage(tabIdToUse, { type: 'browser_snapshot', payload });
        // Always include the tab info used for the snapshot in the response
        return { ...snapshot, activeTab: tabInfoResult };
    } catch (e: any) {
        // Robust error envelope for protocol compliance
        console.error('[MCP Background] handleBrowserSnapshot error:', e);
        return { success: false, error: { code: 'SNAPSHOT_ERROR', message: e.message }, activeTab: tabInfoResult };
    }
}

initialize();