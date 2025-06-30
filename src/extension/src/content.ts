// mcp/src/extension/src/content.ts
import { findElementByLocator } from "./element-resolver.js";

// ====================================================================================
// DESIGN PHILOSOPHY & JUSTIFICATION
// ====================================================================================
//
// PURPOSE:
// This content script is the "hands" of the AI in the browser. It receives commands,
// interacts with the DOM, and reports back the success or failure of its actions.
//
// DESIGN PHILOSOPHY:
// The script is built around a "Fail-Fast Pipeline" to ensure actions are robust,
// secure, and provide maximally insightful feedback. This makes the system easier
// for an AI to use correctly and harder to use incorrectly.
//
// THE PIPELINE:
// 1. VALIDATE REQUEST: A quick sanity check that the message is well-formed.
// 2. FIND ELEMENT: Use the powerful, iframe-aware resolver to find the target.
// 3. CHECK INTERACTABILITY: This is the most critical phase. The script verifies
//    that the element is in a state a human could interact with. This prevents
//    the AI from trying to act on hidden, disabled, or obscured elements.
//    This phase is broken into multiple helper functions for clarity and to
//    provide hyper-specific error messages.
// 4. EXECUTE ACTION: Only if all previous checks pass, the script attempts the
//    requested DOM action (e.g., click, type). Any runtime errors here are caught.
//
// This pipeline transforms a simple failure ("could not click") into actionable
// intelligence ("Element is obscured by <div id='cookie-banner'>..."), guiding
// the AI on how to recover and successfully complete its task.
//
// ====================================================================================


// --- START INTERACTABILITY HELPERS ---

/**
 * Checks if an element is programmatically disabled or readonly.
 * @param element The element to check.
 * @returns An error message if the check fails, otherwise null.
 */
function checkElementState(element: Element): string | null {
    if (element.hasAttribute('disabled')) {
        return "Element is disabled via the 'disabled' attribute.";
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        if (element.readOnly) {
            return "Input element is read-only.";
        }
    }
    return null;
}

/**
 * Checks if an element is visually present in the DOM according to its CSS styles and dimensions.
 * @param element The element to check.
 * @returns An error message if the check fails, otherwise null.
 */
function checkElementVisibility(element: Element): string | null {
    const style = window.getComputedStyle(element);
    if (style.display === 'none') return "Element is not displayed (CSS 'display: none').";
    if (style.visibility === 'hidden') return "Element is hidden (CSS 'visibility: hidden').";
    if (parseFloat(style.opacity) < 0.1) return "Element is effectively transparent (CSS 'opacity' is less than 0.1).";

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return "Element has zero width or height, making it invisible.";

    return null;
}

/**
 * Checks if the center of an element is obscured by another element on top of it.
 * @param element The element to check.
 * @returns An error message if the check fails, otherwise null.
 */
function checkElementObscurity(element: Element): string | null {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (centerX < 0 || centerY < 0 || centerX > window.innerWidth || centerY > window.innerHeight) {
        return "Element's center is outside the visible viewport.";
    }

    const topElement = document.elementFromPoint(centerX, centerY);

    if (topElement && topElement !== element && !element.contains(topElement)) {
        // FINAL POLISH: The error message now includes a snippet of the obscuring element's HTML for easier debugging.
        return `Element is obscured by another element: <${topElement.tagName.toLowerCase()} id="${topElement.id || ''}" class="${topElement.className || ''}">. Obscuring element's outerHTML (first 250 chars): "${topElement.outerHTML.slice(0, 250)}"`;
    }
    return null;
}

// --- END INTERACTABILITY HELPERS ---


/**
 * Main message listener from the background script.
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    const { type, payload } = request;

    const handleAction = async (): Promise<{ success: boolean; error?: string }> => {
        // --- 1. VALIDATE REQUEST ---
        if (!payload?.locator) {
            return { success: false, error: `Action '${type}' is invalid: it is missing a locator object.` };
        }
        const locatorText = JSON.stringify(payload.locator);

        // --- 2. FIND ELEMENT ---
        const element = findElementByLocator(payload.locator);
        if (!element) {
            return { success: false, error: `Element not found for locator: ${locatorText}` };
        }

        // --- 3. CHECK INTERACTABILITY ---
        const interactabilityError =
            checkElementState(element) ||
            checkElementVisibility(element) ||
            checkElementObscurity(element);
        if (interactabilityError) {
            return { success: false, error: `Element found but not interactable. Reason: ${interactabilityError} Locator: ${locatorText}` };
        }

        // --- 4. EXECUTE ACTION ---
        try {
            switch (type) {
                case 'browser_click':
                    (element as HTMLElement).click();
                    await new Promise(resolve => setTimeout(resolve, 50));
                    return { success: true };

                case 'browser_hover':
                    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
                    return { success: true };

                case 'browser_type':
                    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
                        return { success: false, error: `Element is not a valid text input. Locator: ${locatorText}` };
                    }
                    element.focus();
                    element.value = payload.text;
                    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    if (payload.submit) {
                        const form = element.closest('form');
                        if (form) {
                            typeof form.requestSubmit === 'function' ? form.requestSubmit() : form.submit();
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                    }
                    element.blur();
                    return { success: true };

                case 'browser_select_option':
                    if (!(element instanceof HTMLSelectElement)) {
                        return { success: false, error: `Element is not a <select> dropdown. Locator: ${locatorText}` };
                    }
                    let changed = false;
                    Array.from(element.options).forEach(option => {
                        if (payload.values.includes(option.value) || payload.values.includes(option.text)) {
                            option.selected = true;
                            changed = true;
                        }
                    });
                    if (changed) element.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true };

                case 'browser_drag':
                    if (!payload.endElement) return { success: false, error: "Drag action is missing 'endElement' locator." };
                    const endElement = findElementByLocator(payload.endElement);
                    if (!endElement) return { success: false, error: `Drag target not found. End locator: ${JSON.stringify(payload.endElement)}` };

                    // FINAL POLISH: The drop target must also be interactable.
                    // We don't check its state (e.g. 'disabled') as drop zones often are not form elements,
                    // but we must ensure it's visible and not covered.
                    const endElementInteractabilityError = checkElementVisibility(endElement) || checkElementObscurity(endElement);
                    if(endElementInteractabilityError) return { success: false, error: `Drag target found but not interactable. Reason: ${endElementInteractabilityError}`};

                    const dataTransfer = new DataTransfer();
                    element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
                    endElement.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
                    endElement.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
                    endElement.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
                    element.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
                    return { success: true };

                default:
                    return { success: false, error: `Unknown action type '${type}' received.` };
            }
        } catch (e: any) {
            return { success: false, error: `Action '${type}' threw an exception during execution. Reason: ${e.message}. Locator: ${locatorText}` };
        }
    };

    handleAction()
        .then(sendResponse)
        .catch(e => {
            const errorMessage = e instanceof Error ? e.message : String(e);
            sendResponse({ success: false, error: `A critical exception occurred in content script: ${errorMessage}` });
        });

    return true;
});