// mcp/src/tools/snapshot.ts
import zodToJsonSchema from "zod-to-json-schema";
import {
    SnapshotTool,
    ClickTool,
    DragTool,
    HoverTool,
    SelectOptionTool,
    TypeTool,
} from "../types/mcp/tool.schemas.js";
import type { Context } from "@/context.js";
import { captureAriaSnapshot } from "@/utils/aria-snapshot.js";
import { stringifyLocator } from "../utils/locator.stringifier.js";
import { makeCommonTool } from "./common.js";
import type { Tool } from "./tool.js";
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
export const click: Tool = makeCommonTool(
  "browser_click",
  ClickTool,
  ({ locator }) => ({ locator }),
  ({ locator }) => `Clicked element found via ${stringifyLocator(locator)}`,
  true
);

/**
 * Drags an element from a start locator to an end locator in the active browser tab. Returns a snapshot after the drag.
 * Arguments: startElement (any), endElement (any)
 */
export const drag: Tool = makeCommonTool(
  "browser_drag",
  DragTool,
  ({ startElement, endElement }) => ({ startElement, endElement }),
  ({ startElement, endElement }) => `Dragged element from ${stringifyLocator(startElement)} to ${stringifyLocator(endElement)}`,
  true
);

/**
 * Hovers over an element in the active browser tab, identified by a locator. Returns a snapshot after the hover.
 * Arguments: locator (any)
 */
export const hover: Tool = makeCommonTool(
  "browser_hover",
  HoverTool,
  ({ locator }) => ({ locator }),
  ({ locator }) => `Hovered over element found via ${stringifyLocator(locator)}`,
  true
);

/**
 * Types text into an element in the active browser tab, identified by a locator. Optionally submits after typing. Returns a snapshot after typing.
 * Arguments: locator (any), text (string), submit? (boolean)
 */
export const type: Tool = makeCommonTool(
  "browser_type",
  TypeTool,
  ({ locator, text, submit }) => ({ locator, text, submit }),
  ({ locator, text }) => `Typed "${text}" into element found via ${stringifyLocator(locator)}`,
  true
);

/**
 * Selects an option in a dropdown or select element in the active browser tab, identified by a locator. Returns a snapshot after selection.
 * Arguments: locator (any), values (any)
 */
export const selectOption: Tool = makeCommonTool(
  "browser_select_option",
  SelectOptionTool,
  ({ locator, values }) => ({ locator, values }),
  ({ locator }) => `Selected option in element found via ${stringifyLocator(locator)}`,
  true
);