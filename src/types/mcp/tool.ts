// mcp/src/types/mcp/tool.ts
import { z } from "zod";
import { LocatorSchema } from "./locator.js";

export const ClickTool = z.object({
  name: z.literal("browser_click"),
  description: z.literal("Clicks an element. This is the primary tool for interacting with buttons, links, and other clickable elements."),
  arguments: z.object({
    locator: LocatorSchema.describe("The locator identifying the element to click. Recommendation: Use the 'aria-role' strategy for buttons and links."),
  }),
});

export const TypeTool = z.object({
  name: z.literal("browser_type"),
  description: z.literal("Types text into an input field. This tool correctly simulates user input to work with modern web frameworks."),
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

export const SnapshotTool = z.object({
    name: z.literal("browser_snapshot"),
    description: z.literal("Captures the current state of the page's accessibility tree. CRITICAL FIRST STEP: Call this to get context before using locators."),
    arguments: z.object({}),
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

export const ListTabsTool = z.object({
  name: z.literal("browser_list_tabs"),
  description: z.literal(
    "Lists all open, automatable (http/https) tabs. Provides IDs needed for `browser_set_active_tab` as well as contextual information like title, URL, and state (active, audible, pinned). This should be the first step in any workflow that needs to select a specific tab."
  ),
  arguments: z.object({}),
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