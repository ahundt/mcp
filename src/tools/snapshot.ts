// mcp/src/tools/snapshot.ts
import zodToJsonSchema from "zod-to-json-schema";
import {
    SnapshotTool,
    ClickTool,
    DragTool,
    HoverTool,
    SelectOptionTool,
    TypeTool,
    Tool,
    ToolFactory,
} from "../types/mcp/tool.schemas.js";
import type { Context } from "@/context.js";
import { captureAriaSnapshot } from "@/utils/aria-snapshot.js";
import { stringifyLocator } from "../utils/locator.stringifier.js";
import { makeCommonTool, makeToolFactory } from "./common.js";
import type { SocketMessageMap } from "@/types/messages/ws.types.js";

/**
 * TOOL DESIGN PATTERN (FACTORY, NOT INHERITANCE)
 * ------------------------------------------------
 * This file uses the makeCommonTool factory from common.ts to create browser automation tools
 * with shared logic for argument validation, error handling, and optional snapshotting.
 *
 * Each tool below is either:
 *   - Created via makeCommonTool (inherits shared logic via composition)
 *   - Custom (implements unique logic directly)
 *
 * See common.ts for full documentation of makeCommonTool usage and implementation.
 */

/**
 * Captures a full ARIA snapshot of the current page.
 * Arguments: none
 */
export const snapshot: Tool = {
    schema: {
        name: SnapshotTool.shape.name.value,
        description: SnapshotTool.shape.description.value,
        inputSchema: zodToJsonSchema(SnapshotTool.shape.arguments),
    },
    handle: async (context: Context) => {
        return await captureAriaSnapshot(context, "Page snapshot captured");
    },
};

/**
 * Clicks an element in the active browser tab, identified by a locator. Returns a snapshot after the click.
 * Arguments: locator (any)
 */
export const click: ToolFactory = makeToolFactory(
  ClickTool,
  {
    actionName: "browser_click",
    successMessage: ({ locator }: any) => `Clicked element found via ${stringifyLocator(locator)}`,
  }
);

/**
 * Drags an element from a start locator to an end locator in the active browser tab. Returns a snapshot after the drag.
 * Arguments: startElement (any), endElement (any)
 */
export const drag: ToolFactory = makeToolFactory(
  DragTool,
  {
    actionName: "browser_drag",
    successMessage: ({ startElement, endElement }: any) => `Dragged element from ${stringifyLocator(startElement)} to ${stringifyLocator(endElement)}`,
  }
);

/**
 * Hovers over an element in the active browser tab, identified by a locator. Returns a snapshot after the hover.
 * Arguments: locator (any)
 */
export const hover: ToolFactory = makeToolFactory(
  HoverTool,
  {
    actionName: "browser_hover",
    successMessage: ({ locator }: any) => `Hovered over element found via ${stringifyLocator(locator)}`,
  }
);

/**
 * Types text into an element in the active browser tab, identified by a locator. Optionally submits after typing. Returns a snapshot after typing.
 * Arguments: locator (any), text (string), submit? (boolean)
 */
export const type: ToolFactory = makeToolFactory(
  TypeTool,
  {
    actionName: "browser_type",
    successMessage: ({ locator, text }: any) => `Typed "${text}" into element found via ${stringifyLocator(locator)}`,
  }
);

/**
 * Selects an option in a dropdown or select element in the active browser tab, identified by a locator. Returns a snapshot after selection.
 * Arguments: locator (any), values (any)
 */
export const selectOption: ToolFactory = makeToolFactory(
  SelectOptionTool,
  {
    actionName: "browser_select_option",
    successMessage: ({ locator }: any) => `Selected option in element found via ${stringifyLocator(locator)}`,
  }
);