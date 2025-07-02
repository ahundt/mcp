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
  ToolConfig,
  TabInfo,
} from "@/types/mcp/tool.schemas.js";
import type { Context } from "@/context.js";
import { captureAriaSnapshot } from "@/utils/aria-snapshot.js";

/**
 * BROWSER AUTOMATION TOOLS - SCHEMA-DRIVEN CONFIGURATION SYSTEM
 * ============================================================
 *
 * This module implements a modern, schema-driven tool factory system using explicit
 * snapshot configuration. The `makeTool` factory provides:
 *
 * - Per-tool snapshot configuration with explicit enabled/defaultValue control
 * - Elimination of centralized pattern lists through self-documenting tool definitions
 * - Schema-driven configuration with minimal boilerplate
 * - Type-safe payload transformations and success messages
 *
 * SNAPSHOT BEHAVIOR CONFIGURATION:
 * ================================
 *
 * 1. EXPLICIT OBJECT CONFIGURATION (Recommended):
 *    `snapshot: { enabled: true, defaultValue: true }` → ToolFactory, snapshots on by default
 *    `snapshot: { enabled: true, defaultValue: false }` → ToolFactory, snapshots off by default
 *    `snapshot: { enabled: false }` → Tool, no snapshot capability
 *
 * 2. SHORTHAND CONFIGURATION:
 *    `snapshot: true` → Equivalent to `{ enabled: true, defaultValue: true }`
 *    `snapshot: false` → Equivalent to `{ enabled: false }`
 *    `snapshot: 'auto'` → Uses isInteractiveTool() pattern detection
 *
 * 3. TOOL REGISTRATION BENEFITS:
 *    No more repetitive (true)/(false) calls in index.ts
 *    Defaults are self-documenting at tool definition
 *    Users can still override: `toolFactory(false)` to disable snapshots
 *
 * EXAMPLES:
 * =========
 *
 * Always capture snapshots: `navigate()` calls `navigate(true)` by default
 * Optional snapshots: `pressKey()` calls `pressKey(false)` by default, but `pressKey(true)` available
 * No snapshots: `wait` is a simple Tool with no snapshot capability
 *
 * SUCCESS MESSAGE & PAYLOAD TRANSFORMATION:
 * =========================================
 *
 * 1. Custom Function: `successMessage: ({ url }) => \`Navigated to \${url}\``
 * 2. Auto-generated: `\${toolName} completed successfully` (default)
 * 3. Schema Result: If schema defines result type, returns structured JSON
 * 4. Payload Transform: `payloadTransform: ({ tabId }) => ({ tabId: Number(tabId) })`
 * 5. Action Naming: Always matches schema name (convention over configuration)
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
  if (!response) {
    const errorMessage = `Action '${actionName}' failed: No response received from browser extension. Please ensure the browser extension is connected and the target tab is accessible.`;
    return {
      content: [{ type: "text", text: errorMessage }],
      isError: true,
    };
  }

  if (!response.success) {
    const reason = response.error ?? "An unknown error occurred in the browser extension.";
    let actionableMessage = `Action '${actionName}' failed for parameters: ${locatorText}. Reason: ${reason}`;

    // Add actionable guidance based on common error patterns
    if (reason.includes("No active tab")) {
      actionableMessage += "\n\nACTION REQUIRED: Call 'browser_set_active_tab' first with a valid tab ID from 'browser_list_tabs'.";
    } else if (reason.includes("not found") || reason.includes("Element not found")) {
      actionableMessage += "\n\nACTION REQUIRED: Verify the locator is correct. Call 'browser_snapshot' first to see available elements.";
    } else if (reason.includes("connection") || reason.includes("extension")) {
      actionableMessage += "\n\nACTION REQUIRED: Ensure the Browser MCP extension is installed and connected in the target browser tab.";
    }

    return {
      content: [{ type: "text", text: actionableMessage }],
      isError: true,
    };
  }
  return null;
}

// ===== SCHEMA-DRIVEN TOOL FACTORY =====

/**
 * Type guard to check if a snapshot config is an object with enabled/defaultValue properties.
 */
function isSnapshotConfigObject(snapshot: any): snapshot is { enabled: boolean; defaultValue?: boolean } {
  return snapshot && typeof snapshot === 'object' && 'enabled' in snapshot && typeof snapshot.enabled === 'boolean';
}

/**
 * Handles the result processing for a tool based on its schema and response.
 *
 * Purpose: Provides consistent, schema-driven result handling across all tools.
 * Attempts to validate against the schema's result type, falls back to text on failure.
 *
 * @param schema - The Zod schema defining the tool structure
 * @param response - The raw response from the browser extension
 * @param validatedParams - The validated input parameters (for error context)
 * @param successMessageFn - Optional custom success message function
 * @returns A properly formatted ToolResult
 */
function handleToolResult(
  schema: any,
  response: any,
  validatedParams: any,
  successMessageFn?: (params: any) => string
): ToolResult {
  // Ensure we always have a valid response object
  if (!response) {
    const toolName = schema.shape.name?.value || "unknown_tool";
    return {
      content: [{ type: "text", text: `Tool '${toolName}' completed but returned no data.` }]
    };
  }

  // 1. Check if schema defines a result structure
  if (schema.shape.result) {
    // 2. Extract result data, handling protocol envelopes
    //    Some responses come wrapped as { result: actualData }
    const resultData = 'result' in response ? response.result : response;

    try {
      // 3. Attempt to validate the result against the schema
      const parsed = schema.shape.result.parse(resultData);
      // 4. Return structured data as formatted JSON text for MCP compatibility
      return { content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }] };
    } catch (parseError) {
      // 5. Schema validation failed - fall back to stringified output
      //    This preserves the data while indicating a schema mismatch
      const fallbackData = resultData ?? response ?? {};
      return { content: [{ type: "text", text: JSON.stringify(fallbackData, null, 2) }] };
    }
  }

  // 6. No result schema - generate a success message
  const toolName = schema.shape.name?.value || "unknown_tool";
  const message = successMessageFn?.(validatedParams) ?? `${toolName} completed successfully`;
  return { content: [{ type: "text", text: message }] };
}

/**
 * Adds snapshot capture capability to an existing tool.
 *
 * Purpose: Enhances a tool to capture and return page snapshots after successful execution.
 * This is useful for interactive tools where users want to see the result of their action.
 *
 * @param baseTool - The base tool to enhance
 * @param toolName - The tool name (for snapshot message)
 * @param successMessageFn - Optional custom success message function
 * @returns Enhanced tool that captures snapshots
 */
function addSnapshotCapture(
  baseTool: Tool,
  toolName: string,
  successMessageFn?: (params: any) => string
): Tool {
  return {
    ...baseTool, // Preserve schema and other properties
    handle: async (context, params) => {
      // 1. Execute the base tool functionality
      const baseResult = await baseTool.handle(context, params);

      // 2. If the base tool failed, return the error immediately
      //    Don't capture snapshots of error states
      if (baseResult.isError) {
        return baseResult;
      }

      // 3. Generate an appropriate message for the snapshot
      //    Use custom message if provided, otherwise use tool name
      const message = successMessageFn
        ? successMessageFn(params)
        : `${toolName} completed`;

      // 4. Capture the page snapshot with the success message
      const snapshotResult = await captureAriaSnapshot(context, message);

      // 5. Merge base tool results with snapshot content
      //    This provides both the tool's output and the page state
      return {
        content: [...baseResult.content, ...snapshotResult.content]
      };
    }
  };
}

/**
 * The main factory function for creating browser automation tools.
 *
 * This function implements the Schema-Driven Configuration pattern:
 * - Uses explicit snapshot configuration to minimize ambiguity
 * - Provides intelligent defaults while allowing explicit overrides
 * - Maintains strong type safety through generic constraints
 * - Supports both simple tools and snapshot-enabled tool factories
 *
 * @template T - The Zod schema type (automatically inferred)
 * @param schema - The Zod schema defining the tool's structure (name, description, arguments, result?)
 * @param config - Optional configuration to override default behavior
 * @returns Either a Tool (simple) or ToolFactory (supports snapshots)
 */

// Overload: When snapshot is explicitly false or { enabled: false }, return Tool
export function makeTool<T extends z.ZodObject<any>>(
  schema: T,
  config: Partial<ToolConfig<z.infer<T['shape']['arguments']>>> & { snapshot: false | { enabled: false } }
): Tool;

// Overload: When snapshot is explicitly true, 'auto', or { enabled: true }, return ToolFactory
export function makeTool<T extends z.ZodObject<any>>(
  schema: T,
  config: Partial<ToolConfig<z.infer<T['shape']['arguments']>>> & { snapshot: true | 'auto' | { enabled: true; defaultValue?: boolean } }
): ToolFactory;

// Overload: When no config provided, return based on tool name inference
export function makeTool<T extends z.ZodObject<any>>(
  schema: T
): Tool | ToolFactory;

// Overload: When config provided but no explicit snapshot setting
export function makeTool<T extends z.ZodObject<any>>(
  schema: T,
  config: Partial<ToolConfig<z.infer<T['shape']['arguments']>>>
): Tool | ToolFactory;

// Implementation
export function makeTool<T extends z.ZodObject<any>>(
  schema: T,
  config?: Partial<ToolConfig<z.infer<T['shape']['arguments']>>>
): Tool | ToolFactory {
  // 1. Extract tool metadata from schema
  const toolName = schema.shape.name.value;
  const toolDescription = schema.shape.description.value;
  const argumentsSchema = schema.shape.arguments;

  // 2. Determine snapshot behavior using hybrid approach
  //    Priority: explicit config > convention-based inference
  let snapshotMode: boolean | 'auto' = false;
  let defaultSnapshotValue = true;

  if (config?.snapshot !== undefined) {
    if (isSnapshotConfigObject(config.snapshot)) {
      // Config object format: { enabled: boolean, defaultValue?: boolean }
      snapshotMode = config.snapshot.enabled ? 'auto' : false;
      defaultSnapshotValue = config.snapshot.defaultValue ?? true;
    } else if (typeof config.snapshot === 'boolean') {
      // Shorthand boolean format
      snapshotMode = config.snapshot ? 'auto' : false;
      defaultSnapshotValue = true;
    } else if (config.snapshot === 'auto') {
      // Auto-detection mode
      snapshotMode = 'auto';
      defaultSnapshotValue = true;
    }
  } else {
    // No config provided - default to auto-detection
    // This allows tools to be snapshot-enabled by default
    snapshotMode = 'auto';
    defaultSnapshotValue = false;
  }

  // 3. Create the base tool implementation
  const createBaseTool = (): Tool => ({
    // 4. Generate MCP-compliant schema from Zod schema
    schema: {
      name: toolName,
      description: toolDescription,
      inputSchema: zodToJsonSchema(argumentsSchema),
    },

    // 5. Implement the tool's execution logic
    handle: async (context: Context, params: any): Promise<ToolResult> => {
      // 6. Validate input parameters against Zod schema
      //    This ensures type safety and proper error handling
      const validated = argumentsSchema.parse(params);

      // 7. Transform payload if custom transformation is provided
      //    Otherwise, use validated parameters directly (convention)
      const payload = config?.payloadTransform?.(validated) ?? validated;

      // 8. Send WebSocket message to browser extension
      //    Action name always matches schema name (convention over configuration)
      const response = await context.sendSocketMessage(toolName, payload);

      // 9. Handle standard browser extension error responses
      //    This provides consistent error formatting across all tools
      const errorResult = handleBrowserResponse(toolName, JSON.stringify(validated), response);
      if (errorResult) return errorResult;

      // 10. Process successful response using schema-driven logic
      return handleToolResult(schema, response, validated, config?.successMessage);
    }
  });

  // 11. Return appropriate tool type based on snapshot configuration
  if (snapshotMode === false) {
    // 12. Simple tool - no snapshot capability needed
    return createBaseTool();
  }

  // 13. Factory tool - supports optional snapshot capture
  return (snapshot = defaultSnapshotValue) => {
    const baseTool = createBaseTool();

    // 14. Add snapshot capability if requested
    return snapshot
      ? addSnapshotCapture(baseTool, toolName, config?.successMessage)
      : baseTool;
  };
}

// ===== NEW TOOL DEFINITIONS USING makeTool() =====

/**
 * Returns the TabInfo for the current automation tab (set by browser_set_active_tab).
 *
 * SAFETY FEATURES:
 * - Never automatically converts user tabs to automation tabs
 * - Only uses tabs explicitly marked as `isActiveForAutomation: true`
 * - Can create safe new tabs when no automation tab exists
 *
 * NEW WINDOW BEHAVIOR:
 * - 'always': Always create a new automation tab
 * - 'on-no-automation-tab': Create new tab only if no automation tab exists (DEFAULT, SAFEST)
 * - 'never': Fail with clear error if no automation tab exists
 *
 * This tool uses schema-driven result handling to return structured TabInfo data.
 * The response includes success status, tab information, and optional error details.
 * Now supports optional snapshot capture since users may want to see the page state
 * of the active tab.
 *
 * Usage: Call this tool to determine which tab will be targeted by automation commands.
 * The result is always included in browser_snapshot responses as 'activeTab'.
 *
 * @param newWindow - Controls new window creation behavior (optional, defaults to 'on-no-automation-tab')
 */
export const getActiveTabForAutomation: ToolFactory = makeTool(GetActiveTabForAutomationTool, {
  successMessage: ({ newWindow }) => `Retrieved active automation tab info (newWindow: ${newWindow || 'on-no-automation-tab'})`,
  snapshot: { enabled: true, defaultValue: false }, // Available but disabled by default - tab info is usually quick lookup
});

/**
 * Sets a specific tab as the target for all subsequent automation commands.
 *
 * This tool requires payload transformation to convert the tabId to a number type
 * as expected by the browser extension. It supports optional snapshot capture
 * to show the newly activated tab state.
 *
 * Usage: Must be called after browser_list_tabs and before actions like click or type.
 *
 * @param tabId - The ID of the tab to activate (from browser_list_tabs)
 * @param focus - Whether to bring the tab to the foreground (default: true)
 */
export const setActiveTab: ToolFactory = makeTool(SetActiveTabTool, {
  payloadTransform: ({ tabId, focus }) => ({
    tabId: Number(tabId), // Convert string/number to strict number type
    focus
  }),
  successMessage: ({ tabId }) => `Active automation tab set to ${tabId}.`,
  snapshot: { enabled: true, defaultValue: true }, // Always capture snapshot after tab changes
});

/**
 * Navigates the current browser tab to a new URL.
 *
 * This tool supports snapshot capture to show the page state after navigation.
 * The navigation action name matches the schema name by convention.
 *
 * Usage: Provide a full URL including protocol (e.g., 'https://www.google.com').
 *
 * @param url - The full URL to navigate to
 */
export const navigate: ToolFactory = makeTool(NavigateTool, {
  successMessage: ({ url }) => `Successfully navigated to ${url}`,
  snapshot: { enabled: true, defaultValue: true }, // Always capture snapshot after navigation
});

/**
 * Navigates to the previous page in the browser's session history.
 *
 * This tool requires no configuration as it follows pure conventions:
 * - Action name matches schema name (browser_go_back)
 * - No payload transformation needed (empty arguments)
 * - Automatic snapshot detection (interactive tool)
 *
 * Usage: Simply call to go back one page in history.
 */
export const goBack: ToolFactory = makeTool(GoBackTool, {
  successMessage: () => "Navigated back one page",
  snapshot: { enabled: true, defaultValue: true }, // Always capture snapshot after navigation
});

/**
 * Navigates to the next page in the browser's session history.
 *
 * This tool requires no configuration as it follows pure conventions:
 * - Action name matches schema name (browser_go_forward)
 * - No payload transformation needed (empty arguments)
 * - Automatic snapshot detection (interactive tool)
 *
 * Usage: Simply call to go forward one page in history.
 */
export const goForward: ToolFactory = makeTool(GoForwardTool, {
  successMessage: () => "Navigated forward one page",
  snapshot: { enabled: true, defaultValue: true }, // Always capture snapshot after navigation
});

/**
 * Pauses execution for a specified number of seconds.
 *
 * This utility tool does not require snapshot capture as it doesn't modify
 * the page state. It uses automatic snapshot detection which correctly
 * identifies it as a non-interactive tool.
 *
 * Usage: Useful for waiting for dynamically loaded elements to appear.
 *
 * @param time - The number of seconds to wait
 */
export const wait: Tool = makeTool(WaitTool, {
  successMessage: ({ time }) => `Waited for ${time} seconds`,
  snapshot: { enabled: false }, // Completely disable snapshots for utility tool
});

/**
 * Simulates a single key press on the keyboard.
 *
 * This tool supports snapshot capture as key presses can trigger page changes
 * (e.g., pressing Enter to submit forms, Escape to close modals, etc.).
 *
 * Usage: For single key actions like 'Enter', 'Escape', 'ArrowLeft'.
 * Not suitable for typing text (use browser_type instead).
 *
 * @param key - The key to press (standard key values)
 */
export const pressKey: ToolFactory = makeTool(PressKeyTool, {
  successMessage: ({ key }) => `Pressed key: ${key}`,
  snapshot: { enabled: true, defaultValue: false }, // Available but disabled by default - most key presses are minor
});

/**
 * Retrieves all console logs from the browser's developer console.
 *
 * This utility tool is configured to disable snapshots as console logs
 * don't require visual page state documentation. The tool follows
 * conventions for action naming and payload handling.
 *
 * Usage: Call for debugging purposes to see console output.
 * Returns formatted log entries as readable text.
 */
export const getConsoleLogs: Tool = makeTool(GetConsoleLogsTool, {
  successMessage: () => "Console logs retrieved successfully",
  snapshot: { enabled: false }, // Console logs don't need page snapshots
});

/**
 * Takes a screenshot of the current viewport.
 *
 * This tool is explicitly configured to disable snapshots as the screenshot
 * itself is the visual output. Adding a snapshot would be redundant.
 *
 * Usage: For debugging or visual verification of page state.
 * Returns the image as PNG data.
 */
export const screenshot: Tool = makeTool(ScreenshotTool, {
  successMessage: () => "Screenshot captured successfully",
  snapshot: { enabled: false }, // Screenshots don't need additional snapshots
});