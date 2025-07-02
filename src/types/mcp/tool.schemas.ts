// mcp/src/types/mcp/tool.schemas.ts
// ===================================================================
// BROWSER AUTOMATION TOOL SCHEMAS - AI-OPTIMIZED VERSION
// ===================================================================
//
// This file contains enhanced tool schemas designed specifically for AI models,
// with comprehensive guidance, workflow hints, and safeguards to prevent common
// mistakes and misuse. Each schema includes:
//
// - Detailed descriptions with workflow context
// - Common pitfalls and how to avoid them
// - Recommended locator strategies
// - Error handling guidance
// - Prerequisites and ordering requirements
//
// AI WORKFLOW PRINCIPLES:
// ----------------------
// 1. ALWAYS call browser_snapshot FIRST to get context and locators
// 2. Use semantic locators (aria-role, label) over CSS when possible
// 3. Handle errors gracefully with fallback strategies
// 4. Maintain tab state consistently throughout workflows
// 5. Validate tool results before proceeding to next steps
// ===================================================================

import { z } from "zod";
import type {
  ImageContent,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import type { JsonSchema7Type } from "zod-to-json-schema";
import type { Context } from "@/context";
import { LocatorSchema } from "./locator.schemas.js";

// ===== CORE WORKFLOW PATTERNS =====
//
// AI AUTOMATION WORKFLOW GUIDANCE:
// ================================
//
// ESSENTIAL WORKFLOW STEPS (Follow this order for reliable automation):
//
// 1. TAB DISCOVERY & SETUP:
//    → browser_list_tabs (discover available tabs)
//    → browser_set_active_tab (choose target tab) OR browser_get_active_tab_for_automation (get/create automation tab)
//    → browser_navigate (if going to a new URL)
//
// 2. CONTEXT GATHERING (CRITICAL):
//    → browser_snapshot (ALWAYS call this first before any locator-based actions!)
//    → Analyze snapshot to identify elements and their locators
//    → Choose the most stable locator strategy for each element
//
// 3. INTERACTION PHASE:
//    → Use locator-based tools (browser_click, browser_type, browser_select_option, etc.)
//    → Validate results and handle errors gracefully
//    → Take additional snapshots as needed to track changes
//
// 4. COMPLETION & VERIFICATION:
//    → browser_screenshot (optional, for visual verification)
//    → Validate final state matches expectations
//
// LOCATOR STRATEGY RECOMMENDATIONS:
// =================================
//
// PREFERRED (Most Stable):
// 1. aria-role + name: Perfect for buttons, links, interactive elements
//    Example: { using: "aria-role", role: "button", name: "Submit" }
//
// 2. label + text: Ideal for form inputs with associated labels
//    Example: { using: "label", text: "Email Address" }
//
// 3. placeholder: Good for inputs without labels but with placeholder text
//    Example: { using: "placeholder", text: "Enter your email" }
//
// FALLBACK (Use when semantic options unavailable):
// 4. css: Use CSS selectors from snapshot suggestions
//    Example: { using: "css", selector: "input[name='email']" }
//
// AVOID (Debugging only):
// 5. ref: Temporary IDs that change between snapshots
//    Example: { using: "ref", value: "s1e40" } // Only for debugging!
//
// ERROR HANDLING PATTERNS:
// ========================
//
// Common Errors and Solutions:
//
// 1. "Element not found" → Take new snapshot, element may have changed
// 2. "Tab not found" → Call browser_list_tabs and browser_set_active_tab
// 3. "Locator ambiguous" → Add elementType to label locators, use more specific CSS
// 4. "Connection lost" → Retry with exponential backoff, re-establish tab connection
// 5. "Content script not ready" → Wait briefly, then retry operation
//
// FORM FILLING BEST PRACTICES:
// ============================
//
// 1. Take snapshot to see all form fields and their locators
// 2. Fill fields in logical order (top to bottom, required fields first)
// 3. Use appropriate tools: browser_type for text, browser_select_option for dropdowns
// 4. Validate each field is filled correctly before moving to next
// 5. Handle dynamic content (fields that appear/disappear based on other selections)
// 6. Use browser_press_key for special keys like Tab, Enter, Escape
// 7. Consider using submit: true on final field or separate browser_click on submit button
//
// ===================================================================

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
        "🔧 TAB MANAGEMENT: Returns the TabInfo for the current automation tab (set by browser_set_active_tab). " +
        "If no automation tab exists, behavior depends on 'newWindow' parameter: 'always' creates new tab, " +
        "'on-no-automation-tab' (default) creates tab only if needed, 'never' returns error. " +
        "\n\n" +
        "⚠️  SAFETY: Never automatically converts user tabs to automation tabs. " +
        "\n\n" +
        "🎯 WHEN TO USE: At the start of workflows to ensure you have a valid automation target, " +
        "or after connection issues to re-establish tab state. " +
        "\n\n" +
        "💡 AI TIP: Use 'on-no-automation-tab' (default) for safety - only creates new tabs when necessary. " +
        "Use 'never' when you want to ensure you're working with an existing tab. " +
        "Only use 'always' when you specifically need a fresh tab for testing."
    ),
    arguments: z.object({
        newWindow: z.enum(['always', 'on-no-automation-tab', 'never']).optional().default('on-no-automation-tab').describe(
            "Controls new window creation behavior: " +
            "'always' = always create new automation tab (use for fresh testing), " +
            "'on-no-automation-tab' = create only if no automation tab exists (default, safest for most workflows), " +
            "'never' = fail if no automation tab exists (use when you must work with existing tab)"
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
    description: z.literal(
        "📸 CONTEXT GATHERING: Captures the current state of the web browser page's accessibility tree. " +
        "\n\n" +
        "🚨 CRITICAL FIRST STEP: ALWAYS call this to get context before using locators! " +
        "The response always includes 'activeTab', which is the result of browser_get_active_tab_for_automation. " +
        "\n\n" +
        "🎯 PROVIDES: Complete page structure, all interactive elements, suggested locators for each element, " +
        "current form values, and temporary 'ref' IDs for debugging. " +
        "\n\n" +
        "💡 AI WORKFLOW: Use this to understand what's on the page, identify form fields, buttons, and links, " +
        "then choose the best locator strategy for each element you need to interact with. " +
        "\n\n" +
        "⚠️  LOCATOR GUIDANCE: Prefer stable locators (aria-role, label) over temporary ones (ref). " +
        "CSS selectors from snapshot are good fallbacks when semantic options aren't available."
    ),
    arguments: z.object({}),
    result: z.object({
        activeTab: z.object({
            success: z.boolean(),
            tab: TabInfoSchema.optional(),
            error: z.string().optional(),
        }).describe("The current automation tab info, as returned by browser_get_active_tab_for_automation."),
        snapshot: z.any().describe("The accessibility tree or page state as captured by the extension, including suggested locators for all interactive elements."),
    }),
});

export const ListTabsTool = z.object({
  name: z.literal("browser_list_tabs"),
  description: z.literal(
    "🗂️  TAB DISCOVERY: Lists all open, automatable (http/https) tabs. " +
    "Provides IDs needed for `browser_set_active_tab` as well as contextual information like title, URL, and state (active, audible, pinned). " +
    "\n\n" +
    "🎯 WHEN TO USE: This should be the first step in any workflow that needs to select a specific tab. " +
    "Use this to find the tab you want to automate, then call browser_set_active_tab with the chosen tabId. " +
    "\n\n" +
    "💡 AI TIP: Look for tabs with relevant titles or URLs that match your automation target. " +
    "The 'isActiveForAutomation' field tells you if a tab is already set up for automation."
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
    "🎯 TAB TARGETING: Sets a specific tab as the target for all subsequent automation commands. " +
    "Must be called after `browser_list_tabs` and before actions like `click` or `type` can be used on a specific tab. " +
    "\n\n" +
    "📋 WORKFLOW: 1) browser_list_tabs → 2) browser_set_active_tab → 3) browser_snapshot → 4) interact with page " +
    "\n\n" +
    "💡 AI TIP: Always verify the tab was successfully activated before proceeding with page interactions. " +
    "Use focus=false for background automation that shouldn't disturb the user's current work. " +
    "\n\n" +
    "⚠️  ERROR RECOVERY: If activation fails, check that the tabId is valid and the tab still exists. " +
    "Call browser_list_tabs again if needed to get updated tab information."
  ),
  arguments: z.object({
    tabId: z.number().describe("The ID of the tab to activate, obtained from the `browser_list_tabs` tool."),
    focus: z.boolean().optional().default(true).describe("If true (default), the tab and its window will be brought to the foreground. Set to false to target a tab for potential background actions without disturbing the user."),
  }),
});

export const ClickTool = z.object({
  name: z.literal("browser_click"),
  description: z.literal(
    "🖱️  PRIMARY INTERACTION: Clicks an element. This is the primary tool for interacting with buttons, links, and other clickable elements. " +
    "\n\n" +
    "🎯 BEST PRACTICE: Always call browser_snapshot first to get current page context and available locators. " +
    "\n\n" +
    "🔍 LOCATOR STRATEGY: " +
    "• PREFERRED: Use 'aria-role' for buttons/links (e.g., {using: 'aria-role', role: 'button', name: 'Submit'}) " +
    "• GOOD: Use 'label' for form elements " +
    "• FALLBACK: Use CSS selectors from snapshot " +
    "• AVOID: 'ref' values (temporary and unreliable) " +
    "\n\n" +
    "⚠️  ERROR RECOVERY: If click fails, verify element exists with fresh snapshot, check if element is visible/enabled, " +
    "try more specific locator, or wait for dynamic content to load. " +
    "\n\n" +
    "💡 AI TIP: For form submissions, consider using submit=true in browser_type instead of clicking submit buttons."
  ),
  arguments: z.object({
    locator: LocatorSchema.describe("The locator identifying the element to click. Recommendation: Use the 'aria-role' strategy for buttons and links."),
  }),
});

export const TypeTool = z.object({
  name: z.literal("browser_type"),
  description: z.literal(
    "⌨️  TEXT INPUT: Types text into an input field. This tool correctly simulates user input to work with modern web frameworks. " +
    "\n\n" +
    "🎯 FORM FILLING: Essential for entering text into forms, search boxes, and text areas. " +
    "Use submit=true to submit forms after typing instead of clicking submit buttons. " +
    "\n\n" +
    "🔍 LOCATOR STRATEGY: " +
    "• PREFERRED: Use 'label' strategy (e.g., {using: 'label', text: 'Email Address'}) " +
    "• GOOD: Use 'placeholder' for fields identified by placeholder text " +
    "• FALLBACK: Use CSS selectors for input[name=...] or input[id=...] " +
    "• AVOID: 'ref' values (temporary and unreliable) " +
    "\n\n" +
    "⚠️  ERROR RECOVERY: If typing fails, verify field exists with fresh snapshot, check if field is enabled/visible, " +
    "clear existing content first, or try clicking the field before typing. " +
    "\n\n" +
    "💡 AI TIP: For password fields, be cautious about logging sensitive data. " +
    "Use submit=true for final form field to automatically submit the form."
  ),
  arguments: z.object({
    locator: LocatorSchema.describe("The locator identifying the text input or textarea. Recommendation: Use the 'label' strategy."),
    text: z.string().describe("The text to type into the element."),
    submit: z.boolean().optional().default(false).describe("If true, attempts to submit the form after typing. Defaults to false."),
  }),
});

export const HoverTool = z.object({
    name: z.literal("browser_hover"),
    description: z.literal(
        "🖱️  HOVER INTERACTION: Hovers the mouse over an element, often used to reveal tooltips, dropdown menus, or trigger hover effects. " +
        "\n\n" +
        "🎯 COMMON USES: Revealing hidden navigation menus, showing tooltips, triggering hover states for CSS effects, " +
        "or activating dropdown menus that appear on hover. " +
        "\n\n" +
        "🔍 LOCATOR STRATEGY: Use the same strategies as clicking - 'aria-role' for interactive elements, " +
        "'label' for form-related elements, CSS selectors as fallback. " +
        "\n\n" +
        "⚠️  ERROR RECOVERY: If hover doesn't trigger expected behavior, verify element exists, " +
        "try a fresh snapshot after hovering, or combine with a brief wait for dynamic content. " +
        "\n\n" +
        "💡 AI TIP: After hovering, often need to take a fresh snapshot to see newly revealed elements."
    ),
    arguments: z.object({
        locator: LocatorSchema.describe("The locator identifying the element to hover over."),
    }),
});

export const SelectOptionTool = z.object({
    name: z.literal("browser_select_option"),
    description: z.literal(
        "📋 DROPDOWN SELECTION: Selects one or more options in a <select> dropdown menu. " +
        "\n\n" +
        "🎯 FORM INTERACTION: Essential for choosing values from dropdown lists, multi-select boxes, and combo boxes. " +
        "\n\n" +
        "🔍 LOCATOR STRATEGY: " +
        "• PREFERRED: Use 'label' strategy to find the <select> element (e.g., {using: 'label', text: 'Country'}) " +
        "• GOOD: Use 'aria-role' with role='combobox' " +
        "• FALLBACK: Use CSS selectors for select[name=...] " +
        "• NOTE: Locator targets the <select> element itself, not the individual options " +
        "\n\n" +
        "🎛️  VALUE MATCHING: The 'values' array can match either the option's visible text OR its 'value' attribute. " +
        "Try visible text first (e.g., ['United States']), then try value attributes if that fails (e.g., ['US']). " +
        "\n\n" +
        "⚠️  ERROR RECOVERY: If selection fails, verify dropdown exists with fresh snapshot, " +
        "check if options have loaded, try exact text match vs value attribute, " +
        "or click dropdown to open it first. " +
        "\n\n" +
        "💡 AI TIP: For dynamic dropdowns that load options async, wait for content to load or retry with fresh snapshot."
    ),
    arguments: z.object({
        locator: LocatorSchema.describe("The locator for the <select> element itself. Recommendation: Use the 'label' strategy."),
        values: z.array(z.string()).describe("An array of strings to match against the options. Can match an option's 'value' attribute or its visible text."),
    }),
});

export const DragTool = z.object({
    name: z.literal("browser_drag"),
    description: z.literal(
        "🔄 DRAG & DROP: Performs a drag-and-drop operation from a start element to a target element. " +
        "\n\n" +
        "🎯 USE CASES: Moving items in sortable lists, dragging files to upload areas, " +
        "reordering elements, or interacting with drag-based interfaces. " +
        "\n\n" +
        "🔍 LOCATOR STRATEGY: Both startElement and endElement use standard locator strategies. " +
        "Ensure both elements are visible and draggable/droppable before attempting the operation. " +
        "\n\n" +
        "⚠️  ERROR RECOVERY: If drag fails, verify both elements exist and are interactive, " +
        "check that drag-and-drop is supported on the target elements, " +
        "or try clicking source element first to ensure it's selected. " +
        "\n\n" +
        "💡 AI TIP: Some drag operations require specific timing - consider adding waits " +
        "or verifying intermediate states during complex drag sequences."
    ),
    arguments: z.object({
        startElement: LocatorSchema.describe("The locator for the element to begin dragging from."),
        endElement: LocatorSchema.describe("The locator for the element or area to drop onto."),
    }),
});

export const PressKeyTool = z.object({
    name: z.literal("browser_press_key"),
    description: z.literal(
        "⌨️  KEYBOARD INPUT: Simulates a single key press on the keyboard, like 'Enter' or 'ArrowDown'. Not for typing text. " +
        "\n\n" +
        "🎯 USE CASES: Submitting forms (Enter), navigating dropdowns (ArrowUp/ArrowDown), " +
        "closing dialogs (Escape), tabbing between fields (Tab), or triggering keyboard shortcuts. " +
        "\n\n" +
        "🔧 KEY VALUES: Use standard key names: 'Enter', 'Escape', 'Tab', 'ArrowLeft', 'ArrowRight', " +
        "'ArrowUp', 'ArrowDown', 'Space', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'. " +
        "\n\n" +
        "⚠️  ERROR RECOVERY: If key press doesn't work, ensure the page has focus, " +
        "verify the key name is correct, or try clicking an element first to set focus. " +
        "\n\n" +
        "💡 AI TIP: For text input, use browser_type instead. For form submission, " +
        "consider using submit=true in browser_type rather than pressing Enter."
    ),
    arguments: z.object({
        key: z.string().describe("The key to press, following standard key values (e.g., 'Enter', 'Escape', 'ArrowLeft')."),
    }),
});

export const NavigateTool = z.object({
    name: z.literal("browser_navigate"),
    description: z.literal(
        "🌐 PAGE NAVIGATION: Navigates the current browser tab to a new URL. " +
        "\n\n" +
        "🎯 USE CASES: Loading initial pages, navigating to different sections of a site, " +
        "or moving to entirely different websites during automation workflows. " +
        "\n\n" +
        "📋 WORKFLOW: After navigation, always call browser_snapshot to get the new page context " +
        "before attempting any interactions. " +
        "\n\n" +
        "⚠️  ERROR RECOVERY: If navigation fails, check URL format, verify network connectivity, " +
        "ensure target site is accessible, or try again after a brief wait. " +
        "\n\n" +
        "💡 AI TIP: Some pages load content dynamically - consider waiting briefly or checking " +
        "multiple snapshots if expected elements don't appear immediately."
    ),
    arguments: z.object({
        url: z.string().url().describe("The full URL to navigate to (e.g., 'https://www.google.com')."),
    }),
});

export const GoBackTool = z.object({
    name: z.literal("browser_go_back"),
    description: z.literal(
        "⬅️  BROWSER HISTORY: Navigates to the previous page in the browser's session history. " +
        "\n\n" +
        "🎯 USE CASES: Returning to previous pages during multi-page workflows, " +
        "undoing navigation mistakes, or following back-and-forth navigation patterns. " +
        "\n\n" +
        "📋 WORKFLOW: After going back, take a fresh browser_snapshot to get the current page context. " +
        "\n\n" +
        "⚠️  ERROR RECOVERY: If going back fails, there may be no previous page in history. " +
        "Consider using browser_navigate to go to a specific URL instead. " +
        "\n\n" +
        "💡 AI TIP: Some single-page applications (SPAs) may not work with browser back/forward. " +
        "Use in-page navigation elements when available."
    ),
    arguments: z.object({}),
});

export const GoForwardTool = z.object({
    name: z.literal("browser_go_forward"),
    description: z.literal(
        "➡️  BROWSER HISTORY: Navigates to the next page in the browser's session history. " +
        "\n\n" +
        "🎯 USE CASES: Moving forward after using browser_go_back, " +
        "or continuing through a previously navigated sequence of pages. " +
        "\n\n" +
        "📋 WORKFLOW: After going forward, take a fresh browser_snapshot to get the current page context. " +
        "\n\n" +
        "⚠️  ERROR RECOVERY: If going forward fails, there may be no next page in history. " +
        "Only works if you've previously used browser_go_back. " +
        "\n\n" +
        "💡 AI TIP: Less commonly used than browser_go_back. " +
        "Most workflows use direct navigation with browser_navigate instead."
    ),
    arguments: z.object({}),
});

export const WaitTool = z.object({
    name: z.literal("browser_wait"),
    description: z.literal(
        "⏱️  TIMING CONTROL: Pauses execution for a specified duration. " +
        "Useful for waiting for dynamically loaded elements to appear or animations to complete. " +
        "\n\n" +
        "🎯 USE CASES: Waiting for AJAX content to load, allowing animations to finish, " +
        "giving slow networks time to respond, or adding delays between rapid interactions. " +
        "\n\n" +
        "💡 BEST PRACTICE: Use shorter waits (0.5-2 seconds) and combine with fresh snapshots " +
        "to verify content has loaded, rather than long waits that slow down automation. " +
        "\n\n" +
        "⚠️  AVOID OVERUSE: Don't rely on fixed waits for dynamic content. " +
        "Instead, use brief waits followed by snapshots to check if elements have appeared. " +
        "\n\n" +
        "🔄 WORKFLOW PATTERN: wait → snapshot → check for expected elements → proceed or retry"
    ),
    arguments: z.object({
        time: z.number().describe("The number of seconds to wait."),
    }),
});

export const GetConsoleLogsTool = z.object({
    name: z.literal("browser_get_console_logs"),
    description: z.literal(
        "🐛 DEBUG ASSISTANCE: Retrieves all console logs from the browser's developer console for debugging. " +
        "\n\n" +
        "🎯 USE CASES: Diagnosing JavaScript errors, understanding why automation failed, " +
        "checking for API errors, or investigating unexpected page behavior. " +
        "\n\n" +
        "💡 DEBUGGING WORKFLOW: Use when automation doesn't work as expected, " +
        "especially after navigation or interaction failures. Console errors often explain why elements aren't responding. " +
        "\n\n" +
        "🔍 ERROR TYPES: Captures console.log, console.error, console.warn, and JavaScript exceptions. " +
        "Look for network errors, script errors, or framework-specific messages. " +
        "\n\n" +
        "🚨 TROUBLESHOOTING: If interactions fail mysteriously, check console logs for clues about " +
        "missing JavaScript libraries, API failures, or client-side validation errors."
    ),
    arguments: z.object({}),
});

export const ScreenshotTool = z.object({
    name: z.literal("browser_screenshot"),
    description: z.literal(
        "📸 VISUAL CAPTURE: Takes a screenshot of the current viewport, useful for debugging or visual verification. " +
        "\n\n" +
        "🎯 USE CASES: Debugging unexpected page states, documenting automation results, " +
        "visual verification of successful actions, or capturing error conditions for analysis. " +
        "\n\n" +
        "💡 DEBUGGING TIP: Use screenshots to verify page state when automation doesn't work as expected. " +
        "Combined with browser_snapshot, provides both structural and visual context. " +
        "\n\n" +
        "📋 WORKFLOW: Often used after navigation, after interactions that change page layout, " +
        "or when troubleshooting locator issues. " +
        "\n\n" +
        "🔧 TECHNICAL NOTE: Captures only the visible viewport, not the entire page. " +
        "Scroll to capture different sections if needed."
    ),
    arguments: z.object({}),
});
