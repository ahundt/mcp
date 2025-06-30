# Browser MCP Architecture

This document outlines the file structure and data flow of the Browser MCP server and its associated components.

## Directory Structure

The project is self-contained within the `mcp/` directory.

-   **/mcp/src/**: Contains all Node.js server-side code. This is the MCP server that communicates with AI clients via stdio and with the browser extension via WebSockets.
    -   `src/index.ts`: The main entry point for the server.
    -   `src/tools/`: Defines the capabilities (tools) that the AI can call, such as `click`, `type`, and `Maps`.
-   **/mcp/types/**: Contains all shared TypeScript type definitions used by both the server (`/src`) and the browser extension (`/extension`). This is the definitive contract for how different parts of the system communicate.
-   **/mcp/extension/**: Contains all the code for the Chrome Browser Extension.
    -   `extension/src/background.ts`: The extension's service worker. It manages the WebSocket connection to the server and handles browser-level commands (like managing tabs and windows).
    -   `extension/src/content.ts`: The extension's content script. It is injected into web pages and is responsible for all direct DOM manipulation (finding elements, clicking, typing).
    -   `extension/src/element-resolver.ts`: A utility used by the content script to translate semantic `Locator` objects into actual DOM elements.

## Data Flow for a `click` Action

1.  **AI Client -> Server:** The AI client sends a `callTool` request for `browser_click` with a `Locator` object as an argument.
2.  **Server (`/src`):**
    -   `server.ts` receives the request.
    -   The tool handler in `src/tools/snapshot.ts` validates the `Locator`.
    -   It sends a `browser_click` message, containing the `Locator`, over the WebSocket to the connected extension.
3.  **Browser Extension (`/extension`):**
    -   `extension/src/background.ts` receives the WebSocket message. It identifies it as a DOM command and forwards it to the content script in the appropriate tab.
    -   `extension/src/content.ts` receives the message. It uses `element-resolver.ts` to find the DOM element described by the `Locator`.
    -   It performs the `.click()` action.
    -   It sends a response message back to the background script, e.g., `{ success: true }`.
4.  **Server (`/src`):**
    -   The background script forwards the response to the server via the WebSocket.
    -   The tool handler in `src/tools/snapshot.ts` receives the `{ success: true }` response.
    -   Seeing that the action succeeded, it captures a new page snapshot and returns it to the AI client as the result of the tool call.
