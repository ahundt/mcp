// mcp/types/messages/ws.ts
import type { Locator } from "../mcp/locator";

export type SocketMessageMap = {
  // --- Page Actions ---
  browser_navigate: { payload: { url: string }; response: void };
  browser_go_back: { payload: {}; response: void };
  browser_go_forward: { payload: {}; response: void };
  browser_wait: { payload: { time: number }; response: void };
  browser_press_key: { payload: { key: string }; response: void };

  // --- Element Interactions (Updated Payloads) ---
  browser_click: { payload: { locator: Locator }; response: { success: boolean, error?: string } };
  browser_type: { payload: { locator: Locator; text: string; submit: boolean }; response: { success: boolean, error?: string } };
  browser_hover: { payload: { locator: Locator }; response: { success: boolean, error?: string } };
  browser_select_option: { payload: { locator: Locator; values: string[] }; response: { success: boolean, error?: string } };
  browser_drag: { payload: { startElement: Locator; endElement: Locator }; response: { success: boolean, error?: string } };

  // --- Data Retrieval ---
  browser_snapshot: { payload: {}; response: string }; // Response is the YAML string
  browser_get_console_logs: { payload: {}; response: any[] };
  browser_screenshot: { payload: {}; response: string }; // Response is base64 string
  getUrl: { payload: undefined; response: string };
  getTitle: { payload: undefined; response: string };
};
