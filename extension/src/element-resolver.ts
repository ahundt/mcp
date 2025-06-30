// mcp/extension/src/element-resolver.ts
import type { Locator } from "../../types/mcp/locator.js";

/**
 * Finds a single HTMLElement in the document using various heuristic strategies.
 * This function is the core of the dynamic element identification.
 * It includes logic to search within nested Shadow DOM trees.
 * @param locator The locator object describing how to find the element.
 * @returns The found HTMLElement, or null if it cannot be found.
 */
export function findElementByLocator(locator: Locator): HTMLElement | null {
  /**
   * Searches for an element within a given document context (main document or a shadow root).
   * @param doc The document or shadow root to search within.
   */
  const searchInContext = (doc: Document | ShadowRoot): HTMLElement | null => {
    switch (locator.using) {
      case "ref":
        return doc.querySelector<HTMLElement>(`[data-mcp-ref="${locator.value}"]`);
      case "css":
        return doc.querySelector<HTMLElement>(locator.selector);
      case "aria-role":
        // Find all elements with the given role and then filter by the accessible name.
        // This is more robust than trying to cram everything into one selector.
        return Array.from(doc.querySelectorAll<HTMLElement>(`[role="${locator.role}"]`))
          .find(el => el.ariaLabel?.trim() === locator.name || el.textContent?.trim() === locator.name) ?? null;
      case "placeholder":
        return doc.querySelector<HTMLElement>(`[placeholder="${locator.text}"]`);
      case "label":
        const labels = Array.from(doc.querySelectorAll('label'));
        const targetLabel = labels.find(l => l.textContent?.trim() === locator.text);
        if (!targetLabel) return null;

        // Heuristic 1: The 'for' attribute is the most explicit and reliable link.
        if (targetLabel.htmlFor) return doc.getElementById(targetLabel.htmlFor) as HTMLElement | null;

        // Heuristic 2: The label element contains the input (e.g., <label>Text<input/></label>).
        const nestedInput = targetLabel.querySelector('input, textarea, select, button');
        if (nestedInput) return nestedInput as HTMLElement;

        // Heuristic 3: The input is an immediate sibling (e.g., <label>Text</label><input/>).
        const adjacentEl = targetLabel.nextElementSibling;
        if (adjacentEl && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(adjacentEl.tagName)) {
          return adjacentEl as HTMLElement;
        }

        return null; // All label heuristics failed.
    }
  };

  /**
   * Recursively searches the main document and any nested shadow DOMs.
   * @param context The current search context, starting with the main document.
   */
  const recursiveSearch = (context: Document | ShadowRoot): HTMLElement | null => {
      const foundInCurrentContext = searchInContext(context);
      if (foundInCurrentContext) {
          return foundInCurrentContext;
      }

      // If not found, search inside any shadow roots within the current context.
      const allElements = context.querySelectorAll('*');
      for (const element of allElements) {
          if (element.shadowRoot) {
              const foundInShadow = recursiveSearch(element.shadowRoot);
              if (foundInShadow) {
                  return foundInShadow;
              }
          }
      }
      return null; // Nothing found in this context or any of its children.
  };

  return recursiveSearch(document);
}
