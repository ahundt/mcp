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


// --- LOCATOR GENERATION HELPERS ---

/**
 * Gets the implicit ARIA role for an element based on its tag and attributes.
 */
function getImplicitAriaRole(element: HTMLElement): string | null {
    const tagName = element.tagName.toLowerCase();
    const type = (element as HTMLInputElement).type?.toLowerCase();

    switch (tagName) {
        case 'button':
            return 'button';
        case 'a':
            return element.hasAttribute('href') ? 'link' : null;
        case 'input':
            switch (type) {
                case 'button':
                case 'submit':
                case 'reset':
                    return 'button';
                case 'checkbox':
                    return 'checkbox';
                case 'radio':
                    return 'radio';
                case 'text':
                case 'email':
                case 'password':
                case 'url':
                case 'tel':
                    return 'textbox';
                default:
                    return 'textbox';
            }
        case 'textarea':
            return 'textbox';
        case 'select':
            return element.hasAttribute('multiple') ? 'listbox' : 'combobox';
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
            return 'heading';
        default:
            return null;
    }
}

/**
 * Finds the label text associated with a form element.
 */
function findLabelText(element: HTMLElement): string | null {
    // Check for explicit label association
    if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) {
            return label.textContent?.trim() || null;
        }
    }

    // Check for nested label
    const parentLabel = element.closest('label');
    if (parentLabel) {
        // Get label text excluding the input element's text
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        const inputClone = clone.querySelector('input, textarea, select, button');
        if (inputClone) {
            inputClone.remove();
        }
        return clone.textContent?.trim() || null;
    }

    // Check for aria-labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
        const labelElement = document.getElementById(labelledBy);
        if (labelElement) {
            return labelElement.textContent?.trim() || null;
        }
    }

    return null;
}

/**
 * Generates a minimal CSS selector for an element.
 */
function generateMinimalCssSelector(element: HTMLElement): string | null {
    // Prefer ID if available and unique
    if (element.id && document.querySelectorAll(`#${element.id}`).length === 1) {
        return `#${element.id}`;
    }

    // Try name attribute for form elements
    const name = (element as HTMLInputElement).name;
    if (name && document.querySelectorAll(`[name="${name}"]`).length === 1) {
        return `[name="${name}"]`;
    }

    // Try data attributes
    for (const attr of element.attributes) {
        if (attr.name.startsWith('data-') && attr.value) {
            const selector = `[${attr.name}="${attr.value}"]`;
            if (document.querySelectorAll(selector).length === 1) {
                return selector;
            }
        }
    }

    // Fall back to tag + classes if unique enough
    const tagName = element.tagName.toLowerCase();
    const classes = Array.from(element.classList)
        .filter(cls => cls.length > 0 && !cls.includes(' '))
        .slice(0, 3)
        .join('.');

    if (classes) {
        const selector = `${tagName}.${classes}`;
        if (document.querySelectorAll(selector).length <= 3) {
            return selector;
        }
    }

    return tagName;
}

/**
 * Creates a human-readable description of an element.
 */
function getElementDescription(element: HTMLElement): string {
    const tagName = element.tagName.toLowerCase();
    const type = (element as HTMLInputElement).type;
    const role = element.getAttribute('role') || getImplicitAriaRole(element);
    const text = element.textContent?.trim().substring(0, 50);
    const label = findLabelText(element);
    const ariaLabel = element.ariaLabel || element.getAttribute('aria-label');

    let description = tagName;
    if (type && type !== 'text') {
        description += ` (${type})`;
    }
    if (role && role !== tagName) {
        description += ` with role ${role}`;
    }

    const displayText = ariaLabel || label || text;
    if (displayText) {
        description += `: "${displayText}"`;
    }

    return description;
}

/**
 * Checks if an element is visible to the user.
 */
function isElementVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           rect.width > 0 &&
           rect.height > 0 &&
           rect.top < window.innerHeight &&
           rect.bottom > 0 &&
           rect.left < window.innerWidth &&
           rect.right > 0;
}

// --- END LOCATOR GENERATION HELPERS ---


/**
 * Main message listener from the background script.
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    const { type, payload } = request;

    // Handle ping messages for connectivity checks
    if (type === 'ping') {
        sendResponse({ type: 'pong' });
        return true;
    }

    const handleAction = async (): Promise<{ success: boolean; error?: string; snapshot?: any }> => {
        // --- 1. VALIDATE REQUEST ---
        // Special case: browser_snapshot doesn't need a locator
        if (type === 'browser_snapshot') {
            const interactiveElements = Array.from(document.querySelectorAll(
                'button, a, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [role="combobox"], [tabindex]'
            )).slice(0, 50).map((el, index) => {
                const element = el as HTMLElement;
                const textContent = element.textContent?.trim();
                const ariaLabel = element.ariaLabel || element.getAttribute('aria-label');
                const placeholder = (element as HTMLInputElement).placeholder;

                // Generate temp ref for debugging
                const ref = `el-${index + 1}`;
                element.setAttribute('data-mcp-ref', ref);

                // Generate locator suggestions with confidence scores
                const suggestions = [];

                // Aria-role strategy (highest confidence for interactive elements)
                const role = element.getAttribute('role') || getImplicitAriaRole(element);
                if (role && (ariaLabel || textContent)) {
                    suggestions.push({
                        using: 'aria-role',
                        role: role,
                        name: ariaLabel || textContent,
                        confidence: ariaLabel ? 'very-high' : 'high'
                    });
                }

                // Label strategy (high confidence for form elements)
                const labelText = findLabelText(element);
                if (labelText) {
                    suggestions.push({
                        using: 'label',
                        text: labelText,
                        confidence: 'high'
                    });
                }

                // Placeholder strategy (medium confidence)
                if (placeholder) {
                    suggestions.push({
                        using: 'placeholder',
                        text: placeholder,
                        confidence: 'medium'
                    });
                }

                // CSS strategy (fallback, low confidence)
                const cssSelector = generateMinimalCssSelector(element);
                if (cssSelector) {
                    suggestions.push({
                        using: 'css',
                        selector: cssSelector,
                        confidence: 'low'
                    });
                }

                return {
                    ref,
                    description: getElementDescription(element),
                    locators: suggestions,
                    bounds: element.getBoundingClientRect(),
                    isVisible: isElementVisible(element),
                    isEnabled: !element.hasAttribute('disabled')
                };
            }).filter(el => el.locators.length > 0);

            return {
                success: true,
                snapshot: {
                    page: {
                        title: document.title,
                        url: window.location.href,
                        timestamp: new Date().toISOString()
                    },
                    elements: interactiveElements,
                    summary: `Found ${interactiveElements.length} interactive elements. Use the 'locators' array to choose the best strategy for each element.`
                }
            };
        }

        if (!payload?.locator) {
            return { success: false, error: `Action '${type}' is invalid: it is missing a locator object.` };
        }
        const locatorText = JSON.stringify(payload.locator);

        // --- 2. FIND ELEMENT ---
        const element = findElementByLocator(payload.locator);
        if (!element) {
            // Enhanced error message with locator suggestions
            const availableElements = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"]'))
                .slice(0, 10)
                .map(el => {
                    const element = el as HTMLElement;
                    const role = element.getAttribute('role') || getImplicitAriaRole(element);
                    const text = element.textContent?.trim() || element.ariaLabel || (element as HTMLInputElement).placeholder;
                    return { role, text: text?.substring(0, 50) };
                })
                .filter(el => el.text)
                .map(el => `${el.role}: "${el.text}"`)
                .join(', ');

            return {
                success: false,
                error: `Element not found for locator: ${locatorText}. Available elements on page: ${availableElements || 'none found'}. Tip: Call browser_snapshot first to see all available elements and their suggested locators.`
            };
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