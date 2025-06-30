// ./mcp/src/utils/locator.ts
import type { Locator } from "@/types/mcp/locator.js";

/**
 * Converts a Locator object into a human-readable string for logging and debugging.
 * @param locator The Locator object to stringify.
 * @returns A string describing the locator strategy and value.
 */
export function stringifyLocator(locator: Locator): string {
    switch (locator.using) {
    case "ref":
        return `ref "${locator.value}"`;
    case "label":
        return `label "${locator.text}"${locator.elementType ? ` for a ${locator.elementType}` : ''}`;
    case "aria-role":
        return `ARIA role "${locator.role}" with name "${locator.name}"`;
    case "placeholder":
        return `placeholder "${locator.text}"`;
    case "css":
        return `CSS selector "${locator.selector}"`;
    }
}