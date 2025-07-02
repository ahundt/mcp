import { z } from "zod";
import type {
  ImageContent,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import type { JsonSchema7Type } from "zod-to-json-schema";

import type { Context } from "@/context";

// ===== MOVED FROM tool.schemas.ts FOR CENTRALIZATION =====
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
  type: z.literal("json"),
  data: z.any(),
});

export const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(),
  mimeType: z.string(),
});

export const ContentSchema = z.union([TextContentSchema, JsonContentSchema, ImageContentSchema]);

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

// ===== LEGACY COMPATIBILITY TYPES =====
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

// ===== EXTENSION INTERFACE FOR CUSTOMIZATION =====
export interface ToolExtensions<T = any> {
  actionName?: string;
  payloadBuilder?: (params: T) => any;
  successMessage?: (params: T) => string;
}
