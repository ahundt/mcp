import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { Context } from "@/context";
import type { Resource } from "@/resources/resource";
import type { Tool } from "@/types/mcp/tool.schemas";
import { createWebSocketServer } from "./websocket-server";

type Options = {
  name: string;
  version: string;
  tools: Tool[];
  resources: Resource[];
};

export async function createServerWithTools(options: Options): Promise<Server> {
  const { name, version, tools, resources } = options;
  const context = new Context();
  const server = new Server(
    { name, version },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  const wss = await createWebSocketServer();
  wss.on("connection", (websocket, req) => {
    // --- Client Identification ---
    const ip = req?.socket?.remoteAddress || 'unknown';
    const origin = req?.headers?.origin || 'unknown';
    const userAgent = req?.headers?.['user-agent'] || 'unknown';
    const clientInfo = `[IP: ${ip}] [Origin: ${origin}] [User-Agent: ${userAgent}]`;
    console.log(`\x1b[36m[MCP Server] WebSocket client connected ${clientInfo}\x1b[0m`);

    // --- Single-Client Policy ---
    if (context.hasWs()) {
      context.ws.close(4000, 'Another client connected');
      console.warn(`\x1b[33m[MCP Server] Previous client forcibly disconnected to allow new connection.\x1b[0m`);
    }
    context.ws = websocket;

    websocket.on("close", (code, reason) => {
      const reasonStr = reason ? reason.toString() : '';
      let msg = `[MCP Server] WebSocket client disconnected ${clientInfo} [Code: ${code}]`;
      if (reasonStr) msg += ` [Reason: ${reasonStr}]`;
      if (code !== 1000) {
        // Non-normal closure
        console.error(`\x1b[31m${msg}\x1b[0m`);
      } else {
        console.log(`\x1b[36m${msg}\x1b[0m`);
      }
    });
    websocket.on("error", (err) => {
      console.error(`\x1b[31m[MCP Server] WebSocket error ${clientInfo}: ${err.message}\x1b[0m`);
    });
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: tools.map((tool) => tool.schema) };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: resources.map((resource) => resource.schema) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((tool) => tool.schema.name === request.params.name);
    if (!tool) {
      return {
        content: [
          { type: "text", text: `Tool "${request.params.name}" not found` },
        ],
        isError: true,
      };
    }

    try {
      const result = await tool.handle(context, request.params.arguments);
      return result;
    } catch (error) {
      return {
        content: [{ type: "text", text: String(error) }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const resource = resources.find(
      (resource) => resource.schema.uri === request.params.uri,
    );
    if (!resource) {
      return { contents: [] };
    }

    const contents = await resource.read(context, request.params.uri);
    return { contents };
  });

  // Save the original close method to avoid recursion
  const originalClose = server.close.bind(server);
  server.close = async () => {
    console.log("[MCP Server] Closing server, WebSocket server, and context...");
    await originalClose();
    await wss.close();
    await context.close();
    console.log("[MCP Server] All resources closed.");
  };

  return server;
}
