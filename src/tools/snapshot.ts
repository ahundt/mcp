// ./mcp/src/tools/snapshot.ts
import zodToJsonSchema from "zod-to-json-schema";
import {
    ClickTool,
    DragTool,
    HoverTool,
    SelectOptionTool,
    SnapshotTool,
    TypeTool,
} from "@repo/types/mcp/tool";
import type { Context } from "@/context";
import { captureAriaSnapshot } from "@/utils/aria-snapshot";
import { stringifyLocator } from "@/utils/locator";
import type { Tool } from "./tool";

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
        if (!response?.success) {
            throw new Error(
                `Action 'browser_click' failed for locator: ${locatorText}.` +
                (response?.error ? ` Reason: ${response.error}` : "") +
                ` Full response: ${JSON.stringify(response)}`
            );
        }
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
        const response = await context.sendSocketMessage("browser_drag", {
            startElement: validatedParams.startElement,
            endElement: validatedParams.endElement,
        });
        if (!response?.success) {
            throw new Error(
                `Action 'browser_drag' failed for start: ${startLocatorText}, end: ${endLocatorText}.` +
                (response?.error ? ` Reason: ${response.error}` : "") +
                ` Full response: ${JSON.stringify(response)}`
            );
        }
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
        if (!response?.success) {
            throw new Error(
                `Action 'browser_hover' failed for locator: ${locatorText}.` +
                (response?.error ? ` Reason: ${response.error}` : "") +
                ` Full response: ${JSON.stringify(response)}`
            );
        }
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
        if (!response?.success) {
            throw new Error(
                `Action 'browser_type' failed for locator: ${locatorText}.` +
                (response?.error ? ` Reason: ${response.error}` : "") +
                ` Full response: ${JSON.stringify(response)}`
            );
        }
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
        if (!response?.success) {
            throw new Error(
                `Action 'browser_select_option' failed for locator: ${locatorText}.` +
                (response?.error ? ` Reason: ${response.error}` : "") +
                ` Full response: ${JSON.stringify(response)}`
            );
        }
        return await captureAriaSnapshot(context, `Selected option in element found via ${locatorText}`);
    },
};