
# Browser MCP Extension: Plan & Insights (Reconciled Architecture)

This document outlines the definitive plan for creating a working extension based on a reconciled understanding of its architecture.

## 1. Definitive Architecture: The "Two-Part Connection" Model

The core confusion has been resolved. The extension operates on a two-part connection model:

*   **Part 1: The Background Connection (Automatic).** The extension's service worker should automatically and persistently try to connect to the MCP server (`ws://localhost:9002`). The existing auto-connect logic in `background.ts` is **correct and will be kept**.

*   **Part 2: The Tab Activation (Manual).** The user must manually designate which tab is the target for automation. The UI button's purpose is **not** to initiate the WebSocket connection, but to tell the background script which tab to activate. This triggers the `handleSetActiveTab` function.

This model successfully reconciles the user requirements for both "auto-connect" and a "connect button."

## 2. Expert Insights & Best Practices

*   **Respect the Original Design:** The primary goal is to fix the existing code. The two-part connection model is the most likely original design.
*   **Fix Build Blockers First:** The missing `@repo` and `uuid` dependencies are the highest priority.
*   **Minimal UI for a Minimal Task:** The popup UI should do one thing: get the current tab's ID and send it to the background script for activation.
*   **Keep Auto-Connect Logic:** The `onInstalled`, `onStartup`, and `onclose` reconnect logic in `background.ts` is essential for the automatic background connection and will be preserved.

## 3. Definitive Plan: Plan B (Explicit Popup Activation)

This plan is the most faithful and robust implementation of the reconciled architecture.

1.  **`dependencies-v1`**: Fix all build-blocking dependencies with minimal changes.
    *   Modify `package.json`: Add `uuid` to `dependencies` and `@types/uuid` to `devDependencies`.
    *   Run `npm install`.
    *   Modify `websocket-server.ts`: Remove `@repo` import and hardcode `port = 9002`.
    *   Modify `index.ts`: Remove `@repo` import and use `packageJSON.name`.
2.  **`scaffolding-v1`**: Create the minimal files for the extension UI.
    *   Create `src/extension/manifest.json`.
    *   Create `src/extension/icons/` directory with `active.svg` and `inactive.svg`.
    *   Create `src/extension/popup.html` and `src/extension/src/popup.ts`.
3.  **`background-refactor-v1`**: Adapt the background script to listen for activation messages from the popup.
    *   **Preserve** the existing automatic WebSocket connection logic.
    *   Add a `chrome.runtime.onMessage` listener that waits for an `ACTIVATE_TAB` message and calls the existing `handleSetActiveTab` function.
    *   Remove the old `chrome.action.onClicked` listener, as the popup now handles this functionality.
4.  **`build-and-verify-v1`**: Run `npm run build` to compile both the server and the extension.

About `index.ts`:

Index.ts launches the program and creates a web socket server:

async function createServer(): Promise<Server> {
    return createServerWithTools({
    name: appConfig.name,
    version: packageJSON.version,
    tools: allTools,
    resources,
    });
}

program
    .version("Version " + packageJSON.version)
    .name(packageJSON.name)
    .action(async () => {
    const server = await createServer();
    setupExitWatchdog(server);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    });

program.parse(process.argv);


 Deconstructing `background.js`


  The provided background.js is minified and bundled, a common practice for production extensions. While difficult to read, a careful analysis reveals the true architecture. This is no longer
  a theory; it is a fact-based reverse-engineering of a working system.


   1. The "Server" is an elaborate in-memory simulation.
       * Evidence: The code contains a massive amount of logic related to the Sentry SDK, Amplitude analytics, rrweb (a session recording library), and Papa Parse (a CSV parser). It also
         contains the entire MCP SDK, bundled in. Crucially, there are no direct calls to `new WebSocketServer()` or any Node.js networking modules. A browser service worker cannot use those
         modules.
       * Conclusion: The "MCP Server" is not a separate process. The Server class from the MCP SDK is instantiated directly within the service worker's memory. It's not a "server" in the
         networking sense, but in the sense that it serves responses to requests.


   2. The Connection is an Internal Message-Passing System.
       * Evidence: The code is replete with calls to chrome.runtime.sendMessage, chrome.tabs.sendMessage, and listeners for chrome.runtime.onMessage. This is the standard way different parts of
         a Chrome extension talk to each other.
       * Conclusion: The "connection" between the "client" (the popup UI) and the "server" (the MCP logic in the background script) is not a WebSocket connection. It is an internal, in-memory
         message bus provided by the Chrome Extension APIs.


   3. External Clients Connect via `externally_connectable`.
       * Evidence: The manifest.json from the unpacked extension contains the "externally_connectable" key.
       * SDK Documentation: This manifest key allows specific, whitelisted web pages (e.g., https://*.browsermcp.io/*) to get a reference to the extension and send messages to it using
         chrome.runtime.sendMessage.
       * Conclusion: This is the missing link. An external client does not connect via a WebSocket. It connects by visiting a whitelisted URL and using the Chrome Extension messaging API. The
         extension listens for these external messages and pipes them to its in-memory MCP Server instance.


   4. Browser Control is via the `debugger` API.
       * Evidence: The manifest.json requires the "debugger" permission. The minified background.js contains strings like "Input.dispatchKeyEvent", "Page.navigate", and "Fetch.enable", which are
         all commands from the Chrome DevTools Protocol (CDP), accessible only via chrome.debugger.
       * Conclusion: The extension's tools do not use content scripts for primary control. They attach the debugger to a target tab and use the CDP for high-privilege, reliable automation.

  The Grand Unified Theory of This Extension


   1. The extension starts. The background.js service worker immediately initializes an in-memory instance of the MCP Server class and all its tools.
   2. An external client (like a web app at browsermcp.io) uses chrome.runtime.sendMessage to talk to the extension.
   3. The background.js script listens for these messages and forwards them to the in-memory Server instance.
   4. The Server instance processes the request (e.g., callTool with the navigate tool).
   5. The navigate tool's handler executes, using chrome.debugger.sendCommand to control the browser.
   6. The result is passed back from the tool, through the Server instance, and sent back to the external client as a response message.
   7. The popup UI (popup.html) is a simple controller to tell the background script which tab to attach the debugger to.

  This architecture is sophisticated, self-contained, and perfectly matches all the evidence.

  ---


  Plan I: The "True Restoration" (Final, Definitive Plan)

  This is the final plan. It is not a new idea, but a high-fidelity restoration of the original, working architecture, informed by our complete understanding. It maximally reuses the provided
  source code.


   * Philosophy: The source code is an un-bundled version of a self-contained "Debugger as Server" extension. The goal is to fix the missing dependencies and scaffold the minimal UI and manifest
     needed to make the source code build into a functional equivalent of the provided unpacked extension.

   * Detailed Technical Steps:


       1. `documentation-v1`: Update extension.md with this final, definitive "Grand Unified Theory" and the "True Restoration" plan. This is crucial to lock in our understanding.
       2. `dependency-v1`:
           * Action: Modify package.json to add "uuid": "^9.0.1" and update "@modelcontextprotocol/sdk": "^1.13.2". Run npm install.
           * Why: Fixes the fatal build error in context.ts and modernizes the core SDK. This is the non-negotiable first step.
       3. `manifest-v1`:
           * Action: Create src/extension/manifest.json. It will be a minimal version of the one provided, declaring "permissions": ["debugger", "tabs", "scripting"], the background service
             worker, the action popup, and the externally_connectable key.
           * Why: This correctly defines the extension's capabilities and entry points.
       4. `server-logic-cleanup-v1`:
           * Action: In src/server.ts, remove the call to createWebSocketServer. In src/index.ts, ensure the allTools array is correctly populated but remove the program.parse() logic, as the
             server is not a command-line app.
           * Why: This is the critical step to decouple the server logic from the incompatible Node.js process model.
       5. `background-integration-v1`:
           * Action: This is the central task. Refactor background.ts to:
               * On startup, import and initialize the MCP Server with all its tools.
               * Listen for messages from both the popup (ACTIVATE_TAB) and external clients (via chrome.runtime.onMessageExternal).
               * Pipe these messages to the in-memory Server instance.
               * When a tab is activated, use chrome.debugger.attach to connect to it.
           * Why: This rebuilds the core of the extension, making it the host for the MCP logic.
       6. `tool-refactor-v1`:
           * Action: Modify the handle function of the navigate tool in src/tools/snapshot.ts to use chrome.debugger.sendCommand.
           * Why: This restores the primary browser control mechanism.
       7. `ui-v1`:
           * Action: Create src/extension/popup.html, src/extension/src/popup.ts, and icons. The popup's only job is to send the ACTIVATE_TAB message.
           * Why: This provides the necessary user control.
