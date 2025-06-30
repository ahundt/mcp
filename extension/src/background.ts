// mcp/extension/src/background.ts
import { WebSocket } from "ws"; // Assuming 'ws' is bundled for the extension context
import type { SocketMessageMap, FocusTabError } from "../../types/messages/ws";
import type { MessagePayload } from "@r2r/messaging/types"; // This path might need adjustment based on actual bundling

/**
 * NOTE: This is an architectural representation. A real extension's background script
 * would need to handle WebSocket creation, bundling, and more complex state management.
 */

// This map holds the association between a server connection and a browser tab.
// In a real extension, this state should be managed more robustly.
const connectionTabMap = new Map<WebSocket, number>();

// This function would be called when the WebSocket server from the MCP process
// establishes a new connection. It needs to be associated with a tab, likely
// initiated from the extension's popup UI.
function onNewConnection(ws: WebSocket, tabId: number) {
    connectionTabMap.set(ws, tabId);

    ws.on('close', () => {
        connectionTabMap.delete(ws);
        console.log(`Connection closed for tab ${tabId}.`);
    });

    ws.on('message', (message) => {
        // Here you would parse the message and route it.
        // For simplicity, we assume a router calls the correct handler.
    });
}

// Clean up connections if the tab is closed by the user.
chrome.tabs.onRemoved.addListener((tabId) => {
    for (const [ws, id] of connectionTabMap.entries()) {
        if (id === tabId) {
            ws.close(); // This triggers the 'close' event handler above.
            break;
        }
    }
});


/**
 * Handles the 'browser_focus_tab' command from the server.
 * This function must live in the background script, as content scripts cannot
 * control tabs or windows.
 * @param ws The WebSocket connection instance from the server.
 * @returns A promise resolving to the success or failure response object.
 */
async function handleFocusTab(ws: WebSocket): Promise<{ success: boolean; error?: FocusTabError }> {
    const tabId = connectionTabMap.get(ws);
    if (!tabId) {
        return { success: false, error: { code: 'NO_ACTIVE_CONNECTION', message: 'No tab is associated with this server connection.' } };
    }

    try {
        // Promise-wrap chrome.tabs.get to handle async/await and chrome.runtime.lastError
        const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
            chrome.tabs.get(tabId, (t) => {
                const err = chrome.runtime.lastError;
                if (err) return reject(new Error(err.message));
                // This can happen if the tab was closed just before this call.
                if (!t) return reject(new Error(`No tab with id: ${tabId}`));
                resolve(t);
            });
        });

        // Block attempts to interact with protected browser pages.
        if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("https://chrome.google.com/")) {
            return { success: false, error: { code: 'FORBIDDEN_URL', message: `Cannot interact with protected browser URL: ${tab.url}`, url: tab.url } };
        }

        // Promise-wrap the update calls to ensure they complete.
        // We update the window first, then the tab.
        await new Promise<void>((resolve, reject) => {
             chrome.windows.update(tab.windowId!, { focused: true }, () => {
                const err = chrome.runtime.lastError;
                if (err) return reject(new Error(err.message));
                resolve();
            });
        });

        await new Promise<void>((resolve, reject) => {
            chrome.tabs.update(tabId, { active: true }, () => {
               const err = chrome.runtime.lastError;
               if (err) return reject(new Error(err.message));
               resolve();
           });
       });

        return { success: true };

    } catch (e: any) {
        // Provide detailed, structured errors based on the exception message.
        if (e.message?.includes("No tab with id")) {
            return { success: false, error: { code: 'TAB_NOT_FOUND', message: e.message, tabId: tabId } };
        }
        if (e.message?.includes("No window with id")) {
            // This is unlikely if getTab succeeded, but we handle it defensively.
            return { success: false, error: { code: 'WINDOW_NOT_FOUND', message: e.message, windowId: -1 }};
        }
        // A catch-all for other Chrome API errors.
        return { success: false, error: { code: 'CHROME_API_ERROR', message: e.message || 'An unknown error occurred in the browser extension.' } };
    }
}

// The background script would also contain the logic to forward DOM-related
// messages (like 'browser_click') to the correct content script.
async function forwardToContentScript<T extends keyof SocketMessageMap>(type: T, payload: MessagePayload<SocketMessageMap, T>) {
    // 1. Get tabId from connectionTabMap
    // 2. Use chrome.tabs.sendMessage(tabId, { type, payload })
    // 3. Return the response from the content script
}
