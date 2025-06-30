// mcp/src/tools/common.ts
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  GoBackTool,
  GoForwardTool,
  NavigateTool,
  PressKeyTool,
  WaitTool,
  ListTabsTool,
  SetActiveTabTool,
} from "@/types/mcp/tool.js";
import type { TabInfo, SetActiveTabError } from "@/types/messages/ws.js";
import type { Context } from "@/context.js";
import { captureAriaSnapshot } from "@/utils/aria-snapshot.js";
import type { Tool, ToolFactory } from "./tool.js";

export const navigate: ToolFactory = (snapshot) => ({
  schema: {
    name: NavigateTool.shape.name.value,
    description: NavigateTool.shape.description.value,
    inputSchema: zodToJsonSchema(NavigateTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { url } = NavigateTool.shape.arguments.parse(params);
    const response = await context.sendSocketMessage("browser_navigate", { url });
    if (!response?.success) {
      throw new Error(`Navigation failed: ${response.error}`);
    }
    if (snapshot) {
      return captureAriaSnapshot(context, `Navigate to ${url}`);
    }
    return { content: [{ type: "text", text: `Navigate to ${url}` }] };
  },
});

export const listTabs: Tool = {
  schema: {
    name: ListTabsTool.shape.name.value,
    description: ListTabsTool.shape.description.value,
    inputSchema: zodToJsonSchema(ListTabsTool.shape.arguments),
  },
  handle: async (context) => {
    const response = await context.sendSocketMessage("browser_list_tabs", {});
    if (!response?.success) {
      throw new Error(`Action 'browser_list_tabs' failed. Reason: ${response.error}`);
    }
    const tabs = response.tabs as TabInfo[];
    const formattedTabs = tabs.map(t =>
      `  - ID: ${t.tabId}, Active for Automation: ${t.isActiveForAutomation}, Title: "${t.title}", URL: ${t.url}`
    ).join('\n');
    return { content: [{ type: "text", text: `Available Tabs:\n${formattedTabs}` }] };
  },
};

export const setActiveTab: Tool = {
  schema: {
    name: SetActiveTabTool.shape.name.value,
    description: SetActiveTabTool.shape.description.value,
    inputSchema: zodToJsonSchema(SetActiveTabTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { tabId, focus } = SetActiveTabTool.shape.arguments.parse(params);
    const response = await context.sendSocketMessage("browser_set_active_tab", { tabId, focus });
    if (!response?.success) {
        const error = response.error as SetActiveTabError | undefined;
        const reason = error ? `Code: ${error.code}, Message: ${error.message}` : "Unknown error.";
        throw new Error(`Action 'browser_set_active_tab' failed for tabId ${tabId}. Reason: ${reason}`);
    }
    return { content: [{ type: "text", text: `Active automation tab set to ${tabId}.` }] };
  },
};

export const navigate: ToolFactory = (snapshot) => ({
  schema: {
    name: NavigateTool.shape.name.value,
    description: NavigateTool.shape.description.value,
    inputSchema: zodToJsonSchema(NavigateTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { url } = NavigateTool.shape.arguments.parse(params);
    await context.sendSocketMessage("browser_navigate", { url });
    if (snapshot) {
      return captureAriaSnapshot(context, `Navigated to ${url}`);
    }
    return {
      content: [{ type: "text", text: `Navigated to ${url}` }],
    };
  },
});

export const goBack: ToolFactory = (snapshot) => ({
  schema: {
    name: GoBackTool.shape.name.value,
    description: GoBackTool.shape.description.value,
    inputSchema: zodToJsonSchema(GoBackTool.shape.arguments),
  },
  handle: async (context) => {
    await context.sendSocketMessage("browser_go_back", {});
    if (snapshot) {
      return captureAriaSnapshot(context, "Navigated back");
    }
    return {
      content: [{ type: "text", text: "Navigated back" }],
    };
  },
});

export const goForward: ToolFactory = (snapshot) => ({
  schema: {
    name: GoForwardTool.shape.name.value,
    description: GoForwardTool.shape.description.value,
    inputSchema: zodToJsonSchema(GoForwardTool.shape.arguments),
  },
  handle: async (context) => {
    await context.sendSocketMessage("browser_go_forward", {});
    if (snapshot) {
      return captureAriaSnapshot(context, "Navigated forward");
    }
    return {
      content: [{ type: "text", text: "Navigated forward" }],
    };
  },
});

export const wait: Tool = {
  schema: {
    name: WaitTool.shape.name.value,
    description: WaitTool.shape.description.value,
    inputSchema: zodToJsonSchema(WaitTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { time } = WaitTool.shape.arguments.parse(params);
    await context.sendSocketMessage("browser_wait", { time });
    return {
      content: [{ type: "text", text: `Waited for ${time} seconds` }],
    };
  },
};

export const pressKey: Tool = {
  schema: {
    name: PressKeyTool.shape.name.value,
    description: PressKeyTool.shape.description.value,
    inputSchema: zodToJsonSchema(PressKeyTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { key } = PressKeyTool.shape.arguments.parse(params);
    await context.sendSocketMessage("browser_press_key", { key });
    return {
      content: [{ type: "text", text: `Pressed key ${key}` }],
    };
  },
};
