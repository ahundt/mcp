// mcp/src/tools/common.ts
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  ListTabsTool,
  SetActiveTabTool,
  NavigateTool,
  GoBackTool,
  GoForwardTool,
  PressKeyTool,
  WaitTool,
  GetActiveTabForAutomationTool,
  GetConsoleLogsTool,
  ScreenshotTool,
} from "@/types/mcp/tool.schemas.js";
import type { TabInfo, SetActiveTabError } from "@/types/messages/ws.types.js";
import type { Context } from "@/context.js";
import { captureAriaSnapshot } from "@/utils/aria-snapshot.js";
import type { Tool, ToolFactory, ToolResult } from "./tool.interface.js";
import type { SocketMessageMap } from "@/types/messages/ws.types.js";

/**
 * TOOL DESIGN PATTERN (FACTORY, NOT INHERITANCE)
 * ------------------------------------------------
 * This file uses higher-order functions (HOFs) and factory functions (not class inheritance)
 * to create browser automation tools with shared logic. The `makeCommonTool` function acts
 * as a factory, generating tool objects that share error handling, argument validation, and
 * optional snapshot logic. This approach provides the benefits of inheritance (shared logic)
 * without the complexity of class hierarchies, making the codebase more maintainable and DRY.
 *
 * Each tool below is either:
 *   - Created via `makeCommonTool` (inherits shared logic via composition)
 *   - Custom (implements unique logic directly)
 */

export const listTabs: Tool = {
  schema: {
    name: ListTabsTool.shape.name.value,
    description: ListTabsTool.shape.description.value,
    inputSchema: zodToJsonSchema(ListTabsTool.shape.arguments),
  },
  handle: async (context) => {
    const response = await context.sendSocketMessage("browser_list_tabs", {});
    const errorResult = handleBrowserResponse('browser_list_tabs', '', response);
    if (errorResult) return errorResult;
    const tabs = response.tabs as TabInfo[];
    const formattedTabs = tabs.map(t =>
      `  - ID: ${t.tabId}, Active for Automation: ${t.isActiveForAutomation}, Title: "${t.title}", URL: ${t.url}`
    ).join('\n');
    return { content: [{ type: "text", text: `Available Tabs:\n${formattedTabs}` }] };
  },
};

/**
 * Handles browser extension responses, returning a ToolResult error if unsuccessful.
 * @param actionName The browser action name.
 * @param locatorText Stringified locator or params for context.
 * @param response The response from the browser extension.
 * @returns ToolResult error or null if successful.
 */
export function handleBrowserResponse(actionName: string, locatorText: string, response: { success: boolean, error?: string } | undefined): ToolResult | null {
  if (!response?.success) {
    const reason = response?.error ?? "An unknown error occurred in the browser extension.";
    const errorMessage = `Action '${actionName}' failed for locator(s): ${locatorText}. Reason: ${reason}`;
    return {
      content: [{ type: "text", text: errorMessage }],
      isError: true,
    };
  }
  return null;
}

// --- Strongly type makeCommonTool for protocol compliance ---
type ActionName = keyof SocketMessageMap;

type ToolArgType<K extends ActionName> = SocketMessageMap[K] extends { payload: infer P } ? P : never;

type ToolFactoryTyped<K extends ActionName> = (
  snapshot?: boolean
) => Tool;

/**
 * Factory: makeCommonTool
 * ----------------------
 * Creates a browser tool with shared logic for argument validation, error handling, and optional snapshotting.
 *
 * Usage:
 *   makeCommonTool<ArgType>(
 *     actionName,         // The browser action name (string)
 *     zodSchema,          // The Zod schema for arguments
 *     buildPayload,       // (params: ArgType) => any - builds the socket message payload from validated params
 *     formatSuccess,      // (params: ArgType) => string - builds the user-facing success message
 *     snapshot?           // (optional) If true, returns a snapshot on success
 *   )
 *
 * Example:
 *   export const navigate: ToolFactory = (snapshot) => makeCommonTool<{ url: string }>(
 *     "browser_navigate",
 *     NavigateTool,
 *     ({ url }) => ({ url }),
 *     ({ url }) => `Navigated to ${url}`,
 *     snapshot
 *   );
 *
 * The buildPayload and formatSuccess arrow functions receive the validated params object.
 * This pattern avoids code repetition and ensures all tools have consistent error handling and snapshot logic.
 *
 * @template T - The type of the validated arguments for the tool.
 * @param actionName The browser action name.
 * @param zodSchema The Zod schema for arguments.
 * @param buildPayload Function to build the socket message payload from validated params.
 * @param formatSuccess Function to build the success message from validated params.
 * @param snapshot If true, returns a snapshot on success.
 * @returns A Tool object with shared logic.
 */
export function makeCommonTool<K extends ActionName>(
  actionName: K,
  zodSchema: any,
  buildPayload: (params: ToolArgType<K>) => ToolArgType<K>,
  formatSuccess: (params: ToolArgType<K>) => string,
  snapshot?: boolean
): Tool {
  return {
    schema: {
      name: zodSchema.shape.name.value,
      description: zodSchema.shape.description.value,
      inputSchema: zodToJsonSchema(zodSchema.shape.arguments),
    },
    handle: async (context, params) => {
      // Validate arguments using the provided Zod schema
      const validated = zodSchema.shape.arguments.parse(params) as ToolArgType<K>;
      // Build the payload for the browser extension
      const payload = buildPayload(validated);
      const response = await context.sendSocketMessage(actionName, payload);
      // Handle errors using the shared error handler
      const errorResult = handleBrowserResponse(actionName as string, JSON.stringify(validated), response);
      if (errorResult) return errorResult;
      // Optionally return a snapshot if requested
      if (snapshot) {
        return captureAriaSnapshot(context, formatSuccess(validated));
      }
      // Return the formatted success message
      return { content: [{ type: "text", text: formatSuccess(validated) }] };
    }
  };
}

/**
 * Tool: getActiveTabForAutomation
 * Returns the TabInfo for the current automation tab (set by browser_set_active_tab),
 * or defaults to the frontmost tab in the current window if none is set.
 * Used to determine which tab will be targeted by automation commands.
 * Always included in browser_snapshot responses as 'activeTab'.
 */
export const getActiveTabForAutomation: Tool = makeCommonTool(
  "browser_get_active_tab_for_automation" as keyof SocketMessageMap,
  GetActiveTabForAutomationTool,
  () => ({}),
  () => "Returned active automation tab info"
);

/**
 * Sets the active browser tab for automation. Optionally focuses the tab and can return a snapshot.
 * Arguments: tabId (string), focus (boolean)
 */
export const setActiveTab: ToolFactory = (snapshot) => makeCommonTool(
  "browser_set_active_tab",
  SetActiveTabTool,
  ({ tabId, focus }) => ({ tabId: Number(tabId), focus }),
  ({ tabId }) => `Active automation tab set to ${tabId}.`,
  snapshot
);

/**
 * Navigates the active browser tab to a specified URL. Optionally returns a snapshot after navigation.
 * Arguments: url (string)
 */
export const navigate: ToolFactory = (snapshot) => makeCommonTool(
  "browser_navigate",
  NavigateTool,
  ({ url }) => ({ url }),
  ({ url }) => `Navigated to ${url}`,
  snapshot
);

/**
 * Navigates the active browser tab back in history. Optionally returns a snapshot after navigation.
 * No arguments.
 */
export const goBack: ToolFactory = (snapshot) => makeCommonTool(
  "browser_go_back",
  GoBackTool,
  () => ({}),
  () => "Navigated back",
  snapshot
);

/**
 * Navigates the active browser tab forward in history. Optionally returns a snapshot after navigation.
 * No arguments.
 */
export const goForward: ToolFactory = (snapshot) => makeCommonTool(
  "browser_go_forward",
  GoForwardTool,
  () => ({}),
  () => "Navigated forward",
  snapshot
);

/**
 * Waits for a specified number of seconds in the browser automation flow.
 * Arguments: time (number)
 */
export const wait: Tool = makeCommonTool(
  "browser_wait",
  WaitTool,
  ({ time }) => ({ time }),
  ({ time }) => `Waited for ${time} seconds`
);

/**
 * Simulates a key press in the active browser tab.
 * Arguments: key (string)
 */
export const pressKey: Tool = makeCommonTool(
  "browser_press_key",
  PressKeyTool,
  ({ key }) => ({ key }),
  ({ key }) => `Pressed key ${key}`
);

/**
 * Retrieves all console logs from the browser's developer console for debugging.
 * Formats logs as a readable string for human/AI consumption.
 */
export const getConsoleLogs: Tool = {
  schema: {
    name: GetConsoleLogsTool.shape.name.value,
    description: GetConsoleLogsTool.shape.description.value,
    inputSchema: zodToJsonSchema(GetConsoleLogsTool.shape.arguments),
  },
  handle: async (context: Context, _params: unknown) => {
    const logs = await context.sendSocketMessage("browser_get_console_logs", {});
    if (!logs || logs.length === 0) {
      return {
        content: [{ type: "text", text: "No console logs found." }],
      };
    }
    const text = logs.map((log: any) => typeof log === 'string' ? log : JSON.stringify(log)).join("\n");
    return {
      content: [{ type: "text", text: `Console Logs:\n${text}` }],
    };
  },
};

/**
 * Takes a screenshot of the current viewport, useful for debugging or visual verification.
 * Returns the image as a PNG for downstream consumers.
 */
export const screenshot: Tool = {
  schema: {
    name: ScreenshotTool.shape.name.value,
    description: ScreenshotTool.shape.description.value,
    inputSchema: zodToJsonSchema(ScreenshotTool.shape.arguments),
  },
  handle: async (context: Context, _params: unknown) => {
    const screenshotData = await context.sendSocketMessage("browser_screenshot", {});
    return {
      content: [{
        type: "image",
        data: screenshotData,
        mimeType: "image/png",
      }],
    };
  },
};