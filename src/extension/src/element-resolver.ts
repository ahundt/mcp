// mcp/src/extension/src/element-resolver.ts
import type { Locator } from "@/types/mcp/locator.js";

// ====================================================================================
// DESIGN PHILOSOPHY, JUSTIFICATION, AND LIMITATIONS
// ====================================================================================
//
// PURPOSE:
// This file is responsible for translating a semantic `Locator` object into a single,
// specific DOM element on a webpage.
//
// DESIGN PHILOSOPHY:
// The design prioritizes robustness and accuracy in the complex environment of the
// modern web. The core architectural choice is a recursive, window-first search
// strategy (`findElementInWindow`) to correctly handle nested contexts.
//
// SEARCH HIERARCHY: Window -> Document -> Shadow DOM -> Iframe Window
// 1. The search begins in a given `window` context.
// 2. It searches the entire `document` associated with that window.
// 3. The search within a document is itself recursive, correctly traversing all
//    nested Shadow DOMs (`searchDocumentAndShadows`).
// 4. If the element is not found, the resolver then iterates through all `<iframe>`
//    elements within that document.
// 5. For each `<iframe>`, it recursively calls the main search function on the
//    iframe's `contentWindow`, starting the process over again in that new context.
//
// LIMITATIONS (BY DESIGN):
// - CROSS-ORIGIN IFRAMES: Due to the web's fundamental Same-Origin Policy, this
//   script CANNOT access the `contentWindow` of an iframe whose origin differs
//   from the parent page. When a `SecurityError` is thrown during this attempt,
//   it is caught, a warning is logged to the console, and the search continues
//   in other, accessible frames. This is not a bug, but an unavoidable security
//   feature of all modern browsers. Automation of cross-origin content is only
//   possible if the extension has been granted specific, broad permissions.
//
// ====================================================================================


/**
 * Searches for an element within a single, specific document or shadow root context.
 * This function does not recurse into other contexts. It is the core matching logic.
 * @param context The Document or ShadowRoot to search within.
 * @param locator The locator object describing the element to find.
 * @returns The found HTMLElement, or null if not found in this specific context.
 */
const searchInContext = (context: Document | ShadowRoot, locator: Locator): HTMLElement | null => {
    switch (locator.using) {
        case "ref":
            return context.querySelector<HTMLElement>(`[data-mcp-ref="${locator.value}"]`);
        case "css":
            return context.querySelector<HTMLElement>(locator.selector);
        case "aria-role":
            return Array.from(context.querySelectorAll<HTMLElement>(`[role="${locator.role}"]`))
                .find(el => el.ariaLabel?.trim() === locator.name || el.textContent?.trim() === locator.name) ?? null;
        case "placeholder":
            return context.querySelector<HTMLElement>(`[placeholder="${locator.text}"]`);
        case "label":
            const labels = Array.from(context.querySelectorAll('label'));
            const targetLabel = labels.find(l => l.textContent?.trim() === locator.text);
            if (!targetLabel) return null;
            if (targetLabel.htmlFor) return context.getElementById(targetLabel.htmlFor) as HTMLElement | null;
            const nestedInput = targetLabel.querySelector('input, textarea, select, button');
            if (nestedInput) return nestedInput as HTMLElement;
            const adjacentEl = targetLabel.nextElementSibling;
            if (adjacentEl && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(adjacentEl.tagName)) {
                return adjacentEl as HTMLElement;
            }
            return null;
    }
};

/**
 * Recursively searches a single document and all of its nested Shadow DOMs.
 * @param context The Document or ShadowRoot to begin searching from.
 * @param locator The locator to find.
 * @returns The found HTMLElement, or null.
 */
const searchDocumentAndShadows = (context: Document | ShadowRoot, locator: Locator): HTMLElement | null => {
    const found = searchInContext(context, locator);
    if (found) return found;

    // Recurse into all shadow roots within the current context.
    for (const element of Array.from(context.querySelectorAll('*'))) {
        if (element.shadowRoot) {
            const foundInShadow = searchDocumentAndShadows(element.shadowRoot, locator);
            if (foundInShadow) return foundInShadow;
        }
    }
    return null;
};

/**
 * The main recursive search function that traverses windows (for iframes).
 * @param currentWindow The window context to search in (e.g., `window` or an iframe's `contentWindow`).
 * @param locator The locator object to find.
 * @returns The found HTMLElement, or null.
 */
function findElementInWindow(currentWindow: Window, locator: Locator): HTMLElement | null {
    const doc = currentWindow.document;

    // 1. Search the entire current document, including all its shadow roots.
    const foundInTopLevel = searchDocumentAndShadows(doc, locator);
    if (foundInTopLevel) return foundInTopLevel;

    // 2. If not found, recursively search inside all accessible iframes in this document.
    for (const iframe of Array.from(doc.querySelectorAll('iframe'))) {
        try {
            // Accessing contentWindow can throw a cross-origin security error.
            if (iframe.contentWindow) {
                const foundInIframe = findElementInWindow(iframe.contentWindow, locator);
                if (foundInIframe) return foundInIframe;
            }
        } catch (e) {
            // This is an expected failure mode for cross-origin iframes. We log a warning
            // for debugging purposes but do not treat it as a fatal error, allowing the
            // search to continue in other, same-origin frames.
            console.warn(`[MCP Element Resolver] Could not access a cross-origin iframe. This is a standard browser security feature. The search will not include this frame.`);
        }
    }

    return null;
}

/**
 * The main exported function that initiates the element search. It provides a clean
 * public API, abstracting away the complexity of recursion and context management.
 * @param locator The locator object describing how to find the element.
 * @returns The found HTMLElement, or null if it cannot be found anywhere on the page.
 */
export function findElementByLocator(locator: Locator): HTMLElement | null {
    // Validate locator structure before searching
    if (!locator || !locator.using) {
        console.warn('[MCP Element Resolver] Invalid locator structure:', locator);
        return null;
    }
    
    // Log search attempt for debugging
    console.log('[MCP Element Resolver] Searching for element with locator:', locator);
    
    // The search always begins from the top-level window where the content script is running.
    const result = findElementInWindow(window, locator);
    
    if (!result) {
        console.warn('[MCP Element Resolver] Element not found for locator:', locator);
    } else {
        console.log('[MCP Element Resolver] Element found successfully:', result.tagName, result.id || result.className);
    }
    
    return result;
}
