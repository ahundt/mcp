# Browser MCP Architecture

This document outlines the file structure and data flow of the Browser MCP server and its associated components.

## Directory Structure

The project's source code is self-contained within the `mcp/src/` directory, which is the `rootDir` for the TypeScript compiler. It is organized as follows:

-   **/src/tools/**: Defines the capabilities (tools) that the AI can call.
-   **/src/types/**: Contains all shared TypeScript type definitions (Zod schemas and type aliases) used by both the server and the extension. This is the definitive contract for the system.
-   **/src/extension/src/**: Contains all the code for the Chrome Browser Extension.
    -   `background.ts`: The extension's service worker. Manages the WebSocket connection and routes all commands.
    -   `content.ts`: The content script. Injected into pages to perform all DOM interactions.
    -   `element-resolver.ts`: A utility to find DOM elements based on semantic locators.
-   **/src/utils/**: Contains server-side utility functions.
-   **Other files** in `/src/` constitute the core MCP server logic.

## AI Automation Workflow

1.  **Discovery:** The AI agent calls `browser_list_tabs()` to get a list of all open, automatable web pages.
2.  **Activation:** The AI chooses a target and calls `browser_set_active_tab({ tabId: ... })` to designate it as the target for automation. The extension brings this tab into focus and provides visual feedback.
3.  **Interaction:** The AI can now call any number of DOM-interaction tools (`browser_click`, `browser_type`, etc.), which will be reliably routed to the active tab.