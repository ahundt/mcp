// mcp/src/types/messages/ws.ts
import type { Locator } from "./mcp/locator.js";

/**
 * Describes the rich information returned for each open tab.
 * IMPORTANT: This type MUST always match the TabInfoSchema in '../mcp/tool.schemas.ts'.
 * If you change the fields here, you must also update TabInfoSchema in tool.schemas.ts.
 * Likewise, if you change TabInfoSchema, update this type to match.
 */
export type TabInfo = {
  tabId: number;
  title: string;
  url: string;
  isActiveForAutomation: boolean; // Is this the tab currently targeted by the MCP server?
  isActiveInWindow: boolean;      // Is this the currently visible tab in its browser window?
  isAudible: boolean;             // Is the tab currently playing sound?
  isPinned: boolean;              // Is the tab pinned?
};

/**
 * Error type for when the `browser_set_active_tab` command fails.
 * This can happen if the specified tab ID does not exist or if there is an issue with the Chrome API.
 */
export type SetActiveTabError =
    | { code: "TAB_NOT_FOUND"; message: string; }
    | { code: "CHROME_API_ERROR"; message: string; };

/**
 * Maps the WebSocket message types to their payload and response structures.
 * This is used to ensure type safety when sending and receiving messages over the WebSocket connection.
 * Each key corresponds to a specific action or command that can be sent to the browser extension.
 * The payload defines the data sent to the extension, while the response defines the expected structure of the response from the extension.
 */
export type SocketMessageMap = {

  // --- New Tab Management Actions ---
  browser_list_tabs: { payload: Record<string, never>; response: { success: boolean; tabs: TabInfo[]; error?: string } };
  browser_set_active_tab: { payload: { tabId: number; focus: boolean }; response: { success: boolean; error?: SetActiveTabError } };

  // --- Browser/Tab Level Actions ---
  browser_navigate: { payload: { url: string }; response: { success: boolean, error?: string } };
  browser_go_back: { payload: Record<string, never>; response: { success: boolean, error?: string } };
  browser_go_forward: { payload: Record<string, never>; response: { success: boolean, error?: string } };
  browser_wait: { payload: { time: number }; response: void };
  browser_press_key: { payload: { key: string }; response: void };


  // --- Element Interactions ---
  browser_click: { payload: { locator: Locator }; response: { success: boolean, error?: string } };
  browser_type: { payload: { locator: Locator; text: string; submit: boolean }; response: { success: boolean, error?: string } };
  browser_hover: { payload: { locator: Locator }; response: { success: boolean, error?: string } };
  browser_select_option: { payload: { locator: Locator; values: string[] }; response: { success: boolean, error?: string } };
  browser_drag: { payload: { startElement: Locator; endElement: Locator }; response: { success: boolean, error?: string } };

  // --- Data Retrieval ---
  browser_snapshot: { payload: Record<string, never>; response: string }; // Response is the YAML string
  browser_get_console_logs: { payload: Record<string, never>; response: unknown[] };
  browser_screenshot: { payload: Record<string, never>; response: string }; // Response is base64 string
  getUrl: { payload: undefined; response: string };
  getTitle: { payload: undefined; response: string };
};
