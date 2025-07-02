// mcp/src/types/mcp/tool.schemas.ts
import { z } from "zod";
import type {
  ImageContent,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import type { JsonSchema7Type } from "zod-to-json-schema";
import type { Context } from "@/context";
import { LocatorSchema } from "./locator.schemas.js";

/**
 * TabInfo schema for use in all tab-related tool schemas.
 * IMPORTANT: This schema MUST always match the TabInfo type in '../messages/ws.types.ts'.
 * If you change the fields here, you must also update the TabInfo type definition in ws.types.ts.
 * Likewise, if you change TabInfo in ws.types.ts, update this schema to match.
 */
export const TabInfoSchema = z.object({
    tabId: z.number(),
    title: z.string(),
    url: z.string(),
    isActiveForAutomation: z.boolean(),
    isActiveInWindow: z.boolean(),
    isAudible: z.boolean(),
    isPinned: z.boolean(),
});

export type TabInfo = z.infer<typeof TabInfoSchema>;

// ===== CONTENT TYPE SCHEMAS =====
export const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const JsonContentSchema = z.object({
  // WARNING: MCP protocol, or at least parts of it
  // does not support JSON content directly. Contents
  // are sent as text, not JSON objects.
  type: z.literal("json"),
  data: z.any(),
});

export const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(),
  mimeType: z.string(),
});

export const ContentSchema = z.union([TextContentSchema, ImageContentSchema]);

// ===== TOOL INTERFACE SCHEMAS =====
export const ToolSchemaZod = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.any(), // JsonSchema7Type
});

export const ToolResultZod = z.object({
  content: z.array(ContentSchema),
  isError: z.boolean().optional(),
});

// ===== TOOL INTERFACE TYPES =====
export type ToolSchema = z.infer<typeof ToolSchemaZod>;
export type ToolResult = z.infer<typeof ToolResultZod>;

export type Tool = {
  schema: ToolSchema;
  handle: (
    context: Context,
    params?: Record<string, any>,
  ) => Promise<ToolResult>;
};

export type ToolFactory = (snapshot?: boolean) => Tool;

// ===== NEW HYBRID CONVENTION-CONFIGURATION INTERFACE =====

/**
 * TOOL CONFIGURATION GUIDE
 * =========================
 *
 * This interface allows you to configure tool behavior while maintaining intelligent
 * defaults through conventions. Here's how each configuration option works:
 *
 * 1. SNAPSHOT CONFIGURATION:
 *    ----------------------
 *    Controls whether tools capture page snapshots after their actions:
 *
 *    • `snapshot: false` → Returns Tool (no snapshot capability)
 *      Example: Utility tools like wait, screenshot that don't need snapshots
 *
 *    • `snapshot: true` → Returns ToolFactory, defaults to capturing snapshots
 *      Example: Tools that always benefit from showing results
 *
 *    • `snapshot: 'auto'` → Uses intelligent pattern detection
 *      Interactive tools (click, navigate) → ToolFactory with snapshots
 *      Utility tools (wait, console) → Tool without snapshots
 *
 *    • Omitted → Defaults to 'auto' behavior
 *
 * 2. PAYLOAD TRANSFORMATION:
 *    ----------------------
 *    Customizes how tool arguments are sent to the browser extension:
 *
 *    • Default: Zod-validated parameters passed directly
 *    • Custom: Transform before sending (e.g., type conversions)
 *
 *    Example:
 *    ```typescript
 *    payloadTransform: ({ tabId, focus }) => ({
 *      tabId: Number(tabId), // Convert to number
 *      focus
 *    })
 *    ```
 *
 * 3. SUCCESS MESSAGES:
 *    -----------------
 *    Controls user feedback for successful tool execution:
 *
 *    • Custom function: Dynamic messages with parameter data
 *    • Omitted: Auto-generated message like "browser_click completed successfully"
 *    • Schema result: If schema defines result type, returns structured JSON
 *
 *    Example:
 *    ```typescript
 *    successMessage: ({ url }) => `Successfully navigated to ${url}`
 *    ```
 *
 * 4. USAGE PATTERNS:
 *    ---------------
 *
 *    Minimal configuration (pure conventions):
 *    ```typescript
 *    export const click = makeTool(ClickTool); // Auto-detects as interactive
 *    ```
 *
 *    Explicit snapshot control:
 *    ```typescript
 *    export const wait = makeTool(WaitTool, { snapshot: false });
 *    export const navigate = makeTool(NavigateTool, { snapshot: 'auto' });
 *    ```
 *
 *    Full customization:
 *    ```typescript
 *    export const setActiveTab = makeTool(SetActiveTabTool, {
 *      payloadTransform: ({ tabId, focus }) => ({ tabId: Number(tabId), focus }),
 *      successMessage: ({ tabId }) => `Switched to tab ${tabId}`,
 *      snapshot: 'auto'
 *    });
 *    ```
 */

/**
 * Configuration interface for the new makeTool factory function.
 * This interface provides a clean, type-safe way to customize tool behavior
 * while maintaining sensible conventions and defaults.
 *
 * @template T - The type of the tool's validated arguments (inferred from schema)
 */
export interface ToolConfig<T = any> {
  /**
   * Optional function to transform validated arguments before sending to the browser extension.
   *
   * Purpose: Some tools need to transform their inputs (e.g., converting string IDs to numbers)
   * before sending to the WebSocket. This function provides a type-safe way to do that.
   *
   * @param params - The validated arguments from the Zod schema
   * @returns The transformed payload to send via WebSocket
   *
   * @example
   * // Convert string tabId to number for browser extension
   * payloadTransform: ({ tabId, focus }) => ({ tabId: Number(tabId), focus })
   *
   * @example
   * // Pass arguments through unchanged (this is the default behavior)
   * payloadTransform: (params) => params
   */
  payloadTransform?: (params: T) => any;

  /**
   * Optional function to generate a user-friendly success message.
   *
   * Purpose: Provides meaningful feedback to users about what action was performed.
   * If not provided, a generic message like "browser_navigate completed successfully" is used.
   *
   * @param params - The validated arguments from the Zod schema
   * @returns A human-readable success message
   *
   * @example
   * // Personalized message with dynamic content
   * successMessage: ({ url }) => `Successfully navigated to ${url}`
   *
   * @example
   * // Simple static message
   * successMessage: () => "Tab activation completed"
   */
  successMessage?: (params: T) => string;

  /**
   * Controls whether this tool should support snapshot capture.
   *
   * - `{ enabled: true, defaultValue: true }`: Create factory, snapshots enabled by default
   * - `{ enabled: true, defaultValue: false }`: Create factory, snapshots disabled by default
   * - `{ enabled: false }`: Never support snapshots (return a simple Tool)
   * - `true`: Shorthand for `{ enabled: true, defaultValue: true }`
   * - `false`: Shorthand for `{ enabled: false }`
   * - `'auto'`: Automatically determine based on tool name conventions
   *
   * Purpose: Interactive tools (click, type, navigate) typically benefit from
   * capturing page snapshots after their action, while utility tools (wait, screenshot)
   * do not need this capability.
   *
   * @default 'auto' - Infers based on tool name patterns
   *
   * @example
   * // Full config object - snapshots available but disabled by default
   * snapshot: { enabled: true, defaultValue: false }
   *
   * @example
   * // Shorthand - force snapshot support with snapshots enabled by default
   * snapshot: true
   *
   * @example
   * // Shorthand - disable snapshots entirely
   * snapshot: false
   *
   * @example
   * // Let the system decide (recommended for most cases)
   * snapshot: 'auto' // or omit entirely
   */
  snapshot?: { enabled: boolean; defaultValue?: boolean } | boolean | 'auto';
}

// Shared result schema for browser_get_active_tab_for_automation and browser_snapshot.activeTab
export const GetActiveTabForAutomationTool = z.object({
    name: z.literal("browser_get_active_tab_for_automation"),
    description: z.literal(
        "Returns the TabInfo for the current automation tab (set by browser_set_active_tab). If no automation tab exists, behavior depends on 'newWindow' parameter: 'always' creates new tab, 'on-no-automation-tab' (default) creates tab only if needed, 'never' returns error. SAFETY: Never automatically converts user tabs to automation tabs."
    ),
    arguments: z.object({
        newWindow: z.enum(['always', 'on-no-automation-tab', 'never']).optional().default('on-no-automation-tab').describe(
            "Controls new window creation behavior: 'always' = always create new automation tab, 'on-no-automation-tab' = create only if no automation tab exists (default, safest), 'never' = fail if no automation tab exists"
        ),
    }),
    result: z.object({
        success: z.boolean(),
        tab: TabInfoSchema.optional(),
        error: z.string().optional(),
        wasNewTabCreated: z.boolean().optional().describe("True if a new tab was created for automation"),
    }),
});

export const SnapshotTool = z.object({
    name: z.literal("browser_snapshot"),
    description: z.literal("Captures the current state of the web browser page's accessibility tree. LOCATOR CRITICAL FIRST STEP: Call this to get context before using locators. The response always includes 'activeTab', which is the result of browser_get_active_tab_for_automation."),
    arguments: z.object({}),
    result: z.object({
        activeTab: z.object({
            success: z.boolean(),
            tab: TabInfoSchema.optional(),
            error: z.string().optional(),
        }).describe("The current automation tab info, as returned by browser_get_active_tab_for_automation."),
        snapshot: z.any().describe("The accessibility tree or page state as captured by the extension."),
    }),
});

export const ListTabsTool = z.object({
  name: z.literal("browser_list_tabs"),
  description: z.literal(
    "Lists all open, automatable (http/https) tabs. Provides IDs needed for `browser_set_active_tab` as well as contextual information like title, URL, and state (active, audible, pinned). This should be the first step in any workflow that needs to select a specific tab."
  ),
  arguments: z.object({}),
  result: z.object({
    success: z.boolean(),
    tabs: z.array(TabInfoSchema),
    error: z.string().optional(),
  }),
});

export const SetActiveTabTool = z.object({
  name: z.literal("browser_set_active_tab"),
  description: z.literal(
    "Sets a specific tab as the target for all subsequent automation commands. Must be called after `browser_list_tabs` and before actions like `click` or `type` can be used on a specific tab."
  ),
  arguments: z.object({
    tabId: z.number().describe("The ID of the tab to activate, obtained from the `browser_list_tabs` tool."),
    focus: z.boolean().optional().default(true).describe("If true (default), the tab and its window will be brought to the foreground. Set to false to target a tab for potential background actions without disturbing the user."),
  }),
});

export const ClickTool = z.object({
  name: z.literal("browser_click"),
  description: z.literal("Clicks an element. This is the primary tool for interacting with buttons, links, and other clickable elements."),
  arguments: z.object({
    locator: LocatorSchema.describe("The locator identifying the element to click. Recommendation: Use the 'aria-role' strategy for buttons and links."),
  }),
});

export const TypeTool = z.object({
  name: z.literal("browser_type"),
  description: z.literal("Types text into an input field. This tool correctly simulates user input to work with modern web frameworks. This is pre"),
  arguments: z.object({
    locator: LocatorSchema.describe("The locator identifying the text input or textarea. Recommendation: Use the 'label' strategy."),
    text: z.string().describe("The text to type into the element."),
    submit: z.boolean().optional().default(false).describe("If true, attempts to submit the form after typing. Defaults to false."),
  }),
});

export const HoverTool = z.object({
    name: z.literal("browser_hover"),
    description: z.literal("Hovers the mouse over an element, often used to reveal tooltips or dropdown menus."),
    arguments: z.object({
        locator: LocatorSchema.describe("The locator identifying the element to hover over."),
    }),
});

export const SelectOptionTool = z.object({
    name: z.literal("browser_select_option"),
    description: z.literal("Selects one or more options in a <select> dropdown menu."),
    arguments: z.object({
        locator: LocatorSchema.describe("The locator for the <select> element itself. Recommendation: Use the 'label' strategy."),
        values: z.array(z.string()).describe("An array of strings to match against the options. Can match an option's 'value' attribute or its visible text."),
    }),
});

export const DragTool = z.object({
    name: z.literal("browser_drag"),
    description: z.literal("Performs a drag-and-drop operation from a start element to a target element."),
    arguments: z.object({
        startElement: LocatorSchema.describe("The locator for the element to begin dragging from."),
        endElement: LocatorSchema.describe("The locator for the element or area to drop onto."),
    }),
});

export const PressKeyTool = z.object({
    name: z.literal("browser_press_key"),
    description: z.literal("Simulates a single key press on the keyboard, like 'Enter' or 'ArrowDown'. Not for typing text."),
    arguments: z.object({
        key: z.string().describe("The key to press, following standard key values (e.g., 'Enter', 'Escape', 'ArrowLeft')."),
    }),
});

export const NavigateTool = z.object({
    name: z.literal("browser_navigate"),
    description: z.literal("Navigates the current browser tab to a new URL."),
    arguments: z.object({
        url: z.string().url().describe("The full URL to navigate to (e.g., 'https://www.google.com')."),
    }),
});

export const GoBackTool = z.object({
    name: z.literal("browser_go_back"),
    description: z.literal("Navigates to the previous page in the browser's session history."),
    arguments: z.object({}),
});

export const GoForwardTool = z.object({
    name: z.literal("browser_go_forward"),
    description: z.literal("Navigates to the next page in the browser's session history."),
    arguments: z.object({}),
});

export const WaitTool = z.object({
    name: z.literal("browser_wait"),
    description: z.literal("Pauses execution. Useful for waiting for dynamically loaded elements to appear."),
    arguments: z.object({
        time: z.number().describe("The number of seconds to wait."),
    }),
});

export const GetConsoleLogsTool = z.object({
    name: z.literal("browser_get_console_logs"),
    description: z.literal("Retrieves all console logs from the browser's developer console for debugging."),
    arguments: z.object({}),
});

export const ScreenshotTool = z.object({
    name: z.literal("browser_screenshot"),
    description: z.literal("Takes a screenshot of the current viewport, useful for debugging or visual verification."),
    arguments: z.object({}),
});
