// mcp/src/tools/common.ts
import { z } from "zod";
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
  Tool,
  ToolFactory,
  ToolResult,
  ToolExtensions,
  TabInfo,
} from "@/types/mcp/tool.schemas.js";
import type { SetActiveTabError } from "@/types/messages/ws.types.js";
import type { Context } from "@/context.js";
import { captureAriaSnapshot } from "@/utils/aria-snapshot.js";
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
 * Creates a browser tool from a Zod schema with optional extensions.
 * This is the new simplified implementation that uses schema-driven result handling.
 *
 * @param schema - Zod schema defining the tool structure (name, description, arguments, result?)
 * @param extensions - Optional customizations for payload building and messaging
 * @returns Fully configured Tool instance
 */
export function makeCommonTool(
  schema: any, // Using any for now to match existing patterns
  extensions: ToolExtensions = {}
): Tool {
  return {
    schema: {
      name: schema.shape.name.value,
      description: schema.shape.description.value,
      inputSchema: zodToJsonSchema(schema.shape.arguments),
    },
    handle: async (context, params) => {
      // 1. Validate arguments using the schema
      const validated = schema.shape.arguments.parse(params);

      // 2. Build payload (use extension or default to validated params)
      const payload = extensions.payloadBuilder?.(validated) ?? validated;

      // 3. Determine action name (use extension or derive from schema)
      const actionName = extensions.actionName ?? schema.shape.name.value;

      // 4. Send socket message and handle protocol errors
      const response = await context.sendSocketMessage(actionName, payload);
      const errorResult = handleBrowserResponse(actionName, JSON.stringify(validated), response);
      if (errorResult) return errorResult;

      // 5. Schema-driven result handling
      if (schema.shape.result) {
        // Extract result data (handle protocol envelopes)
        const resultData = 'result' in response ? response.result : response;
        try {
          // Validate against schema and return as structured content
          const parsed = schema.shape.result.parse(resultData);
          return { content: [{ type: "json", data: parsed }] };
        } catch {
          // Fallback to stringified output if validation fails
          return { content: [{ type: "text", text: JSON.stringify(resultData) }] };
        }
      }

      // 6. Fallback: return success message
      const message = extensions.successMessage?.(validated) ?? `${actionName} completed successfully`;
      return { content: [{ type: "text", text: message }] };
    }
  };
}

/**
 * Creates a tool factory that supports optional snapshot capture.
 * This factory function handles the snapshot logic by merging snapshot content with tool results.
 *
 * @param schema - Zod schema defining the tool structure
 * @param extensions - Optional customizations for payload building and messaging
 * @returns Factory function that creates tools with optional snapshot support
 */
export function makeToolFactory(
  schema: any, // Using any for now to match existing patterns
  extensions: ToolExtensions = {}
): ToolFactory {
  return (snapshot = false) => {
    if (!snapshot) {
      return makeCommonTool(schema, extensions);
    }

    // Enhanced tool that includes snapshot capture
    return {
      schema: {
        name: schema.shape.name.value,
        description: schema.shape.description.value,
        inputSchema: zodToJsonSchema(schema.shape.arguments),
      },
      handle: async (context, params) => {
        // Get the base result from the standard tool
        const baseTool = makeCommonTool(schema, extensions);
        const baseResult = await baseTool.handle(context, params);

        // If there's an error, return it immediately
        if (baseResult.isError) return baseResult;

        // Capture snapshot and merge with base result
        const validated = schema.shape.arguments.parse(params);
        const message = extensions.successMessage?.(validated) ?? `${schema.shape.name.value} completed`;
        const snapshotResult = await captureAriaSnapshot(context, message);

        return { content: [...baseResult.content, ...snapshotResult.content] };
      }
    };
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
  GetActiveTabForAutomationTool,
  {
    actionName: "browser_get_active_tab_for_automation",
    successMessage: () => "Retrieved active automation tab info",
  }
);

/**
 * Sets the active browser tab for automation. Optionally focuses the tab and can return a snapshot.
 * Arguments: tabId (number), focus (boolean)
 */
export const setActiveTab: ToolFactory = makeToolFactory(
  SetActiveTabTool,
  {
    actionName: "browser_set_active_tab",
    payloadBuilder: ({ tabId, focus }: any) => ({ tabId: Number(tabId), focus }),
    successMessage: ({ tabId }: any) => `Active automation tab set to ${tabId}.`,
  }
);

/**
 * Navigates the active browser tab to a specified URL. Optionally returns a snapshot after navigation.
 * Arguments: url (string)
 */
export const navigate: ToolFactory = makeToolFactory(
  NavigateTool,
  {
    actionName: "browser_navigate",
    successMessage: ({ url }: any) => `Navigated to ${url}`,
  }
);

/**
 * Navigates the active browser tab back in history. Optionally returns a snapshot after navigation.
 * No arguments.
 */
export const goBack: ToolFactory = makeToolFactory(
  GoBackTool,
  {
    actionName: "browser_go_back",
    successMessage: () => "Navigated back",
  }
);

/**
 * Navigates the active browser tab forward in history. Optionally returns a snapshot after navigation.
 * No arguments.
 */
export const goForward: ToolFactory = makeToolFactory(
  GoForwardTool,
  {
    actionName: "browser_go_forward",
    successMessage: () => "Navigated forward",
  }
);

/**
 * Waits for a specified number of seconds in the browser automation flow.
 * Arguments: time (number)
 */
export const wait: Tool = makeCommonTool(
  WaitTool,
  {
    actionName: "browser_wait",
    successMessage: ({ time }: any) => `Waited for ${time} seconds`,
  }
);

/**
 * Simulates a key press in the active browser tab.
 * Arguments: key (string)
 */
export const pressKey: Tool = makeCommonTool(
  PressKeyTool,
  {
    actionName: "browser_press_key",
    successMessage: ({ key }: any) => `Pressed key ${key}`,
  }
);

/**
 * Retrieves all console logs from the browser's developer console for debugging.
 * Formats logs as a readable string for human/AI consumption.
 */
export const getConsoleLogs: Tool = makeCommonTool(
  GetConsoleLogsTool,
  {
    actionName: "browser_get_console_logs",
    successMessage: () => "Console logs retrieved successfully",
  }
);

/**
 * Takes a screenshot of the current viewport, useful for debugging or visual verification.
 * Returns the image as a PNG for downstream consumers.
 */
export const screenshot: Tool = makeCommonTool(
  ScreenshotTool,
  {
    actionName: "browser_screenshot",
    successMessage: () => "Screenshot captured successfully",
  }
);