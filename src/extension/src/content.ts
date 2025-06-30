// src/content.ts
import { findElementByLocator } from "./element-resolver.js";

/**
 * Listens for messages from the background script (forwarded from the MCP server)
 * and performs the requested browser actions.
 *
 * All responses are of the form:
 *   { success: boolean, error?: string }
 *
 * On error, the response will always include the action type, locator (as a string), and a detailed error message.
 *
 * The 'locator' is a robust, AI-friendly object describing how to find the element. If the element cannot be found or an action fails, the error will always reference the locator and action.
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const { type, payload } = request;

  // Type guard for payload and locator
  if (!payload || typeof payload !== 'object' || !payload.locator) {
      sendResponse({ success: false, error: `Malformed or missing payload/locator for action '${type}'.` });
      return true;
  }

  let element: Element | null = null;
  let locatorText = '';
  try {
      element = findElementByLocator(payload.locator);
      locatorText = JSON.stringify(payload.locator);
  } catch (e: any) {
      sendResponse({ success: false, error: `Action '${type}' failed: Exception during locator resolution. Reason: ${e?.message || e}` });
      return true;
  }

  // If the element cannot be found, fail gracefully with a descriptive error.
  if (!element) {
      sendResponse({ success: false, error: `Action '${type}' failed: Element not found for locator: ${locatorText}` });
      return true;
  }

  // Use a try-catch block to handle any unexpected errors during DOM interaction.
  try {
    switch (type) {
        case 'browser_click':
            if (element instanceof HTMLElement) {
                try {
                    element.focus();
                    if (typeof element.click === 'function') {
                        element.click();
                    } else {
                        // Fallback for rare cases: dispatch a click event
                        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    }
                    sendResponse({ success: true });
                } catch (clickError: any) {
                    sendResponse({
                        success: false,
                        error: [
                            `Action 'browser_click' failed: Exception during click.`,
                            `Locator: ${locatorText}`,
                            `Element tag: ${element.tagName || 'unknown'}`,
                            `Element outerHTML: ${element.outerHTML?.slice(0, 200) || 'N/A'}`,
                            `Reason: ${clickError?.message || clickError}`
                        ].join(' ')
                    });
                }
            } else {
                // For non-HTMLElements (e.g., SVG), try dispatching a click event
                try {
                    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    sendResponse({ success: true });
                } catch (clickError: any) {
                    sendResponse({
                        success: false,
                        error: [
                            `Action 'browser_click' failed: Element is not an HTMLElement and dispatchEvent failed.`,
                            `Locator: ${locatorText}`,
                            `Element: ${element ? element.constructor.name : 'null'}`,
                            `Node name: ${'nodeName' in element ? (element as any).nodeName : 'unknown'}`,
                            `OuterHTML: ${'outerHTML' in element ? (element as any).outerHTML?.slice(0, 200) : 'N/A'}`,
                            `Reason: ${clickError?.message || clickError}`
                        ].join(' ')
                    });
                }
            }
            return true;

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
                if (payload.submit) {
                    const parentForm = element.closest('form');
                    if (parentForm) {
                        // Use requestSubmit() if available (modern, triggers submit event and validation),
                        // otherwise fall back to .submit() for maximum compatibility.
                        if (typeof parentForm.requestSubmit === 'function') {
                            parentForm.requestSubmit();
                        } else {
                            parentForm.submit();
                        }
                    }
                }
                element.blur();
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: `Action 'browser_type' failed: Locator found an element, but it is not a text input. Locator: ${locatorText}` });
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
                sendResponse({ success: false, error: `Action 'browser_select_option' failed: Locator found an element, but it is not a <select> dropdown. Locator: ${locatorText}` });
            }
            break;

        case 'browser_drag':
            if (!payload.endElement) {
                sendResponse({ success: false, error: `Action 'browser_drag' failed: Missing endElement in payload. Start locator: ${locatorText}` });
                break;
            }
            let endElement: Element | null = null;
            let endLocatorText = '';
            try {
                endElement = findElementByLocator(payload.endElement);
                endLocatorText = JSON.stringify(payload.endElement);
            } catch (e: any) {
                sendResponse({ success: false, error: `Action 'browser_drag' failed: Exception during endElement locator resolution. Start locator: ${locatorText}, End locator: ${endLocatorText}. Reason: ${e?.message || e}` });
                break;
            }
            if (!endElement) {
                sendResponse({ success: false, error: `Action 'browser_drag' failed: Could not find drop target for drag operation. Start locator: ${locatorText}, End locator: ${endLocatorText}` });
            } else {
                try {
                    // This sequence simulates a robust drag-and-drop event flow.
                    const dataTransfer = new DataTransfer();
                    element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
                    endElement.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
                    endElement.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
                    endElement.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
                    element.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
                    sendResponse({ success: true });
                } catch (dragError: any) {
                    sendResponse({ success: false, error: `Action 'browser_drag' failed during drag sequence. Start locator: ${locatorText}, End locator: ${endLocatorText}. Reason: ${dragError?.message || dragError}` });
                }
            }
            break;

        default:
            sendResponse({ success: false, error: `No handler for locator-based message type: ${type}. Locator: ${locatorText}` });
            break;
    }
  } catch(e: any) {
      // Catch any unexpected runtime errors during the action and report them gracefully.
      sendResponse({ success: false, error: `Action '${type}' failed for locator: ${locatorText}. Reason: ${e?.message || e}` });
  }

  // TODO: Add handlers for non-locator-based messages (e.g., navigate, wait) if they
  // need to be handled in the content script. Currently handled by the background script.

  return true; // IMPORTANT: Always return true to indicate you will use sendResponse asynchronously.
});