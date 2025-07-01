// ./mcp/src/tools/custom.ts
import { zodToJsonSchema } from "zod-to-json-schema";
import { GetConsoleLogsTool, ScreenshotTool } from "../types/mcp/tool.schemas.js";
import type { Tool } from "./tool";
import type { Context } from "@/context";

export const getConsoleLogs: Tool = {
  schema: {
    name: GetConsoleLogsTool.shape.name.value,
    description: GetConsoleLogsTool.shape.description.value,
    inputSchema: zodToJsonSchema(GetConsoleLogsTool.shape.arguments),
  },
  handle: async (context, _params) => {
    const consoleLogs = await context.sendSocketMessage("browser_get_console_logs", {});
    if (consoleLogs.length === 0) {
        return {
            content: [{ type: "text", text: "No console logs found." }],
        };
    }
    const text: string = consoleLogs.map((log) => JSON.stringify(log)).join("\n");
    return {
      content: [{ type: "text", text: `Console Logs:\n${text}` }],
    };
  },
};

export const screenshot: Tool = {
  schema: {
    name: ScreenshotTool.shape.name.value,
    description: ScreenshotTool.shape.description.value,
    inputSchema: zodToJsonSchema(ScreenshotTool.shape.arguments),
  },
  handle: async (context, _params) => {
    const screenshotData = await context.sendSocketMessage("browser_screenshot", {});
    return {
      content: [{
        type: "image",
        data: screenshotData,
        mimeType: "image/png",
      }],
    };
  },
};