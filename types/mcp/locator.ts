// mcp/types/mcp/locator.ts
import { z } from "zod";

const ElementTypeSchema = z.enum([
  "textbox", "combobox", "button", "link", "checkbox", "radio", "textarea",
]).describe("A specific WAI-ARIA element type, used to resolve ambiguity when locating by label.");

export const RefLocatorSchema = z.object({
  using: z.literal("ref").describe("Strategy: Use the snapshot 'ref' value."),
  value: z.string().describe("The dynamic 'ref' value (e.g., 's1e40'). WARNING: This is not a stable identifier and should only be used for debugging."),
});

export const LabelLocatorSchema = z.object({
  using: z.literal("label").describe("Strategy: Find a form element by the text of its associated <label>."),
  text: z.string().describe("The exact text content of the <label> element."),
  elementType: ElementTypeSchema.optional().describe("Optional: The ARIA role of the element the label is for. Helps resolve ambiguity if multiple elements share a label."),
});

export const AriaRoleLocatorSchema = z.object({
    using: z.literal("aria-role").describe("Strategy: Find an element by its ARIA role and accessible name. This is the most robust strategy for interactive elements."),
    role: z.string().describe("The ARIA role of the element (e.g., 'button', 'link', 'dialog')."),
    name: z.string().describe("The accessible name of the element, which is typically its visible text content."),
});

export const PlaceholderLocatorSchema = z.object({
  using: z.literal("placeholder").describe("Strategy: Find an input element by its placeholder text."),
  text: z.string().describe("The exact text of the 'placeholder' attribute."),
});

export const CssLocatorSchema = z.object({
  using: z.literal("css").describe("Strategy: Find an element using a CSS selector. Use this as a fallback when semantic locators are not available."),
  selector: z.string().describe("The CSS selector string to find the element."),
});

export const LocatorSchema = z.union([
  RefLocatorSchema,
  LabelLocatorSchema,
  AriaRoleLocatorSchema,
  PlaceholderLocatorSchema,
  CssLocatorSchema,
]).describe(
    "A discriminated union object for locating an element on a web page. " +
    "Recommendation: Prefer 'aria-role' and 'label' for stability. Get context by calling 'browser_snapshot' first."
);

export type Locator = z.infer<typeof LocatorSchema>;
