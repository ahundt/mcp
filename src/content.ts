// extension/src/content.ts
import { findElementByLocator } from "./element-resolver";

/**
 * Listens for messages from the background script (forwarded from the MCP server)
 * and performs the requested browser actions.
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const { type, payload } = request;

  // This is a centralized handler for all actions that require finding an element first.
  if (payload && payload.locator) {
      const element = findElementByLocator(payload.locator);

      // If the element cannot be found, fail gracefully with a descriptive error.
      if (!element) {
          sendResponse({ success: false, error: `Element not found for locator: ${JSON.stringify(payload.locator)}` });
          return true; // Keep the message port open for the response
      }

      // Use a try-catch block to handle any unexpected errors during DOM interaction.
      try {
        switch (type) {
            case 'browser_click':
                element.click();
                sendResponse({ success: true });
                break;

            case 'browser_hover':
                const hoverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window });
                element.dispatchEvent(hoverEvent);
                sendResponse({ success: true });
                break;

            case 'browser_type':
                if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                    element.focus();
                    element.value = payload.text;
                    // Dispatch events to ensure modern frameworks recognize the programmatic change.
                    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    element.blur();
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: "Locator found an element, but it is not a text input." });
                }
                break;

            case 'browser_select_option':
                if (element instanceof HTMLSelectElement) {
                    const options = Array.from(element.options);
                    let changed = false;
                    // This allows selecting multiple options if the dropdown supports it.
                    // It checks against both the option's invisible 'value' and its visible text content.
                    options.forEach(option => {
                        if (payload.values.includes(option.value) || payload.values.includes(option.text)) {
                            option.selected = true;
                            changed = true;
                        }
                    });
                    if (changed) {
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: "Locator found an element, but it is not a <select> dropdown." });
                }
                break;

            case 'browser_drag':
                const endElement = findElementByLocator(payload.endElement);
                if (!endElement) {
                    sendResponse({ success: false, error: `Could not find drop target for drag operation.` });
                } else {
                    // This sequence simulates a robust drag-and-drop event flow.
                    const dataTransfer = new DataTransfer();
                    element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
                    endElement.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
                    endElement.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
                    endElement.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
                    element.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
                    sendResponse({ success: true });
                }
                break;

            default:
                sendResponse({ success: false, error: `No handler for locator-based message type: ${type}` });
                break;
        }
      } catch(e: any) {
          // Catch any unexpected runtime errors during the action and report them gracefully.
          sendResponse({ success: false, error: e.message });
      }
  }

  // TODO: Add handlers for non-locator-based messages (e.g., navigate, wait) if they
  // need to be handled in the content script. Currently handled by the background script.

  return true; // IMPORTANT: Always return true to indicate you will use sendResponse asynchronously.
});