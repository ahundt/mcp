// mcp/src/tools/snapshot.ts
import zodToJsonSchema from "zod-to-json-schema";
import {
    ClickTool,
    DragTool,
    HoverTool,
    SelectOptionTool,
    SnapshotTool,
    TypeTool,
} from "@/types/mcp/tool.js"; // FIXED: Uses correct path alias
import type { Context } from "@/context.js";
import { captureAriaSnapshot } from "@/utils/aria-snapshot.js";
import { stringifyLocator } from "@/utils/locator.js";
import type { Tool, ToolResult } from "./tool.js";

/**
 * A helper function to handle responses from the browser extension.
 * If the response is not successful, it formats a detailed error ToolResult.
 * Otherwise, it returns null, allowing the caller to proceed.
 * @param actionName The name of the browser action (e.g., 'browser_click').
 * @param locatorText A string representation of the locator(s) used.
 * @param response The response object from the browser extension.
 * @returns A ToolResult object if the action failed, otherwise null.
 */
function handleBrowserResponse(actionName: string, locatorText: string, response: { success: boolean, error?: string } | undefined): ToolResult | null {
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

export const click: Tool = {
    schema: {
        name: ClickTool.shape.name.value,
        description: ClickTool.shape.description.value,
        inputSchema: zodToJsonSchema(ClickTool.shape.arguments),
    },
    handle: async (context: Context, params) => {
        const validatedParams = ClickTool.shape.arguments.parse(params);
        const locatorText = stringifyLocator(validatedParams.locator);
        const response = await context.sendSocketMessage("browser_click", { locator: validatedParams.locator });

        const errorResult = handleBrowserResponse('browser_click', locatorText, response);
        if (errorResult) return errorResult;

        return await captureAriaSnapshot(context, `Clicked element found via ${locatorText}`);
    },
};

export const drag: Tool = {
    schema: {
        name: DragTool.shape.name.value,
        description: DragTool.shape.description.value,
        inputSchema: zodToJsonSchema(DragTool.shape.arguments),
    },
    handle: async (context: Context, params) => {
        const validatedParams = DragTool.shape.arguments.parse(params);
        const startLocatorText = stringifyLocator(validatedParams.startElement);
        const endLocatorText = stringifyLocator(validatedParams.endElement);
        const locatorText = `start: ${startLocatorText}, end: ${endLocatorText}`;

        const response = await context.sendSocketMessage("browser_drag", {
            startElement: validatedParams.startElement,
            endElement: validatedParams.endElement,
        });

        const errorResult = handleBrowserResponse('browser_drag', locatorText, response);
        if (errorResult) return errorResult;

        return await captureAriaSnapshot(context, `Dragged element from ${startLocatorText} to ${endLocatorText}`);
    },
};

export const hover: Tool = {
    schema: {
        name: HoverTool.shape.name.value,
        description: HoverTool.shape.description.value,
        inputSchema: zodToJsonSchema(HoverTool.shape.arguments),
    },
    handle: async (context: Context, params) => {
        const validatedParams = HoverTool.shape.arguments.parse(params);
        const locatorText = stringifyLocator(validatedParams.locator);
        const response = await context.sendSocketMessage("browser_hover", { locator: validatedParams.locator });

        const errorResult = handleBrowserResponse('browser_hover', locatorText, response);
        if (errorResult) return errorResult;

        return await captureAriaSnapshot(context, `Hovered over element found via ${locatorText}`);
    },
};

export const type: Tool = {
    schema: {
        name: TypeTool.shape.name.value,
        description: TypeTool.shape.description.value,
        inputSchema: zodToJsonSchema(TypeTool.shape.arguments),
    },
    handle: async (context: Context, params) => {
        const validatedParams = TypeTool.shape.arguments.parse(params);
        const locatorText = stringifyLocator(validatedParams.locator);
        const response = await context.sendSocketMessage("browser_type", {
            locator: validatedParams.locator,
            text: validatedParams.text,
            submit: validatedParams.submit,
        });

        const errorResult = handleBrowserResponse('browser_type', locatorText, response);
        if (errorResult) return errorResult;

        return await captureAriaSnapshot(context, `Typed "${validatedParams.text}" into element found via ${locatorText}`);
    },
};

export const selectOption: Tool = {
    schema: {
        name: SelectOptionTool.shape.name.value,
        description: SelectOptionTool.shape.description.value,
        inputSchema: zodToJsonSchema(SelectOptionTool.shape.arguments),
    },
    handle: async (context: Context, params) => {
        const validatedParams = SelectOptionTool.shape.arguments.parse(params);
        const locatorText = stringifyLocator(validatedParams.locator);
        const response = await context.sendSocketMessage("browser_select_option", {
            locator: validatedParams.locator,
            values: validatedParams.values,
        });

        const errorResult = handleBrowserResponse('browser_select_option', locatorText, response);
        if (errorResult) return errorResult;

        return await captureAriaSnapshot(context, `Selected option in element found via ${locatorText}`);
    },
};