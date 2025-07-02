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
import { makeTool } from "./common.js";
import type { SocketMessageMap } from "@/types/messages/ws.types.js";

/**
 * BROWSER AUTOMATION TOOLS - SNAPSHOT EDITION
 * ============================================
 *
 * This module provides browser automation tools that integrate with ARIA snapshots for
 * improved accessibility and observability. All tools use the new `makeTool` factory
 * from common.ts with explicit snapshot configuration objects to control snapshot behavior.
 *
 * Design Pattern:
 * - Schema-driven configuration using Zod schemas
 * - Convention-over-configuration approach with `makeTool` factory
 * - Explicit snapshot configuration with { enabled: boolean, defaultValue?: boolean }
 * - Type-safe payloadTransform functions for WebSocket message formatting
 *
 * Snapshot Configuration:
 * - { enabled: true, defaultValue: true }: Always capture snapshots by default
 * - { enabled: true, defaultValue: false }: Snapshots available but disabled by default
 * - { enabled: false }: No snapshot capability (returns Tool instead of ToolFactory)
 *
 * Tools included:
 * - snapshot: Manual ARIA snapshot capture (Tool)
 * - click: Click elements with locator (ToolFactory, snapshots enabled by default)
 * - drag: Drag elements between locators (ToolFactory, snapshots enabled by default)
 * - hover: Hover over elements (ToolFactory, snapshots available but disabled by default)
 * - type: Type text into elements (ToolFactory, snapshots enabled by default)
 * - selectOption: Select dropdown options (ToolFactory, snapshots enabled by default)
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
export const click: ToolFactory = makeTool(ClickTool, {
  snapshot: { enabled: true, defaultValue: true }, // Always capture snapshot after clicks
  payloadTransform: ({ locator }: any) => ({
    action: "browser_click",
    locator,
  }),
  successMessage: ({ locator }: any) => `Clicked element found via ${stringifyLocator(locator)}`,
});

/**
 * Drags an element from a start locator to an end locator in the active browser tab. Returns a snapshot after the drag.
 * Arguments: startElement (any), endElement (any)
 */
export const drag: ToolFactory = makeTool(DragTool, {
  snapshot: { enabled: true, defaultValue: true }, // Always capture snapshot after drags
  payloadTransform: ({ startElement, endElement }: any) => ({
    action: "browser_drag",
    startElement,
    endElement,
  }),
  successMessage: ({ startElement, endElement }: any) => `Dragged element from ${stringifyLocator(startElement)} to ${stringifyLocator(endElement)}`,
});

/**
 * Hovers over an element in the active browser tab, identified by a locator. Returns a snapshot after the hover.
 * Arguments: locator (any)
 */
export const hover: ToolFactory = makeTool(HoverTool, {
  snapshot: { enabled: true, defaultValue: false }, // Available but disabled by default - hovers are often temporary
  payloadTransform: ({ locator }: any) => ({
    action: "browser_hover",
    locator,
  }),
  successMessage: ({ locator }: any) => `Hovered over element found via ${stringifyLocator(locator)}`,
});

/**
 * Types text into an element in the active browser tab, identified by a locator. Optionally submits after typing. Returns a snapshot after typing.
 * Arguments: locator (any), text (string), submit? (boolean)
 */
export const type: ToolFactory = makeTool(TypeTool, {
  snapshot: { enabled: true, defaultValue: true }, // Always capture snapshot after typing
  payloadTransform: ({ locator, text, submit }: any) => ({
    action: "browser_type",
    locator,
    text,
    ...(submit !== undefined && { submit }),
  }),
  successMessage: ({ locator, text }: any) => `Typed "${text}" into element found via ${stringifyLocator(locator)}`,
});

/**
 * Selects an option in a dropdown or select element in the active browser tab, identified by a locator. Returns a snapshot after selection.
 * Arguments: locator (any), values (any)
 */
export const selectOption: ToolFactory = makeTool(SelectOptionTool, {
  snapshot: { enabled: true, defaultValue: true }, // Always capture snapshot after selections
  payloadTransform: ({ locator, values }: any) => ({
    action: "browser_select_option",
    locator,
    values,
  }),
  successMessage: ({ locator }: any) => `Selected option in element found via ${stringifyLocator(locator)}`,
});