// mcp/src/types/mcp/locator.ts
import { z } from "zod";

/**
 * 🎯 LOCATOR STRATEGY GUIDE FOR AI AGENTS
 * =====================================
 *
 * This guide helps AI choose the most reliable locator strategies for browser automation.
 * Following these recommendations dramatically improves automation success rates.
 *
 * 📋 PRIORITY ORDER (Use this exact order):
 *
 * 1. 🥇 ARIA-ROLE STRATEGY (Most Reliable)
 *    ----------------------------------------
 *    • BEST FOR: Buttons, links, dialogs, navigation, interactive elements
 *    • WHY: Uses semantic web standards that persist across UI changes
 *    • EXAMPLE: {using: "aria-role", role: "button", name: "Submit"}
 *    • SUCCESS RATE: ~90% for properly labeled interactive elements
 *
 * 2. 🥈 LABEL STRATEGY (Excellent for Forms)
 *    ----------------------------------------
 *    • BEST FOR: Input fields, textareas, select boxes, checkboxes
 *    • WHY: Form labels are stable and required for accessibility
 *    • EXAMPLE: {using: "label", text: "Email Address"}
 *    • SUCCESS RATE: ~85% for properly labeled form elements
 *
 * 3. 🥉 PLACEHOLDER STRATEGY (Good Fallback)
 *    ----------------------------------------
 *    • BEST FOR: Input fields without labels but with placeholder text
 *    • WHY: Placeholder text is usually stable across updates
 *    • EXAMPLE: {using: "placeholder", text: "Enter your email"}
 *    • SUCCESS RATE: ~70% when placeholder text is descriptive
 *
 * 4. 🔧 CSS STRATEGY (Fallback Only)
 *    --------------------------------
 *    • BEST FOR: When semantic strategies aren't available
 *    • USE: Structural selectors like [name="email"], [data-testid="submit"]
 *    • AVOID: Complex DOM paths, brittle class names, positional selectors
 *    • EXAMPLE: {using: "css", selector: "input[name='email']"}
 *    • SUCCESS RATE: ~60% when using stable attributes
 *
 * 5. ⚠️  REF STRATEGY (Debugging Only)
 *    ----------------------------------
 *    • NEVER USE: For production automation
 *    • ONLY FOR: Quick debugging and development
 *    • WHY: Temporary IDs that change between page loads
 *    • SUCCESS RATE: ~10% in real scenarios
 *
 * 🚨 CRITICAL AI WORKFLOW:
 * 1. ALWAYS call browser_snapshot first to get current page context
 * 2. Look for suggested locators in the snapshot response
 * 3. Choose the highest-priority strategy that matches available elements
 * 4. If first choice fails, try next strategy down the priority list
 * 5. Include error recovery in your automation logic
 *
 * 💡 ERROR RECOVERY PATTERNS:
 * • Locator not found → Take fresh snapshot, check if page changed
 * • Multiple matches → Add elementType or use more specific selector
 * • Element not interactive → Wait for page load, check element state
 * • Timing issues → Brief wait + retry with fresh snapshot
 */

const ElementTypeSchema = z.enum([
  "textbox", "combobox", "button", "link", "checkbox", "radio", "textarea",
]).describe(
  "A specific WAI-ARIA element type, used to resolve ambiguity when locating by label. " +
  "Helps when multiple elements share the same label text. Common values: " +
  "'textbox' for text inputs, 'combobox' for select dropdowns, 'button' for buttons."
);

export const RefLocatorSchema = z.object({
  using: z.literal("ref").describe("Strategy: Use the snapshot 'ref' value."),
  value: z.string().describe(
    "⚠️  DEBUGGING ONLY: The dynamic 'ref' value (e.g., 's1e40'). " +
    "WARNING: This is not a stable identifier and should only be used for debugging. " +
    "Ref values change between page loads and are unreliable for production automation. " +
    "Use aria-role, label, or CSS strategies instead for robust automation."
  ),
});

export const LabelLocatorSchema = z.object({
  using: z.literal("label").describe("Strategy: Find a form element by the text of its associated <label>."),
  text: z.string().describe(
    "🥈 EXCELLENT FOR FORMS: The exact text content of the <label> element. " +
    "This is the second-best locator strategy, especially for form fields. " +
    "Use the visible label text exactly as it appears (e.g., 'Email Address', 'First Name'). " +
    "Works for input fields, textareas, select dropdowns, and other form controls."
  ),
  elementType: ElementTypeSchema.optional().describe(
    "Optional disambiguation: The ARIA role of the element the label is for. " +
    "Use when multiple elements share the same label text. " +
    "Examples: 'textbox' for text inputs, 'combobox' for dropdowns, 'checkbox' for checkboxes."
  ),
});

export const AriaRoleLocatorSchema = z.object({
    using: z.literal("aria-role").describe("Strategy: Find an element by its ARIA role and accessible name. This is the most robust strategy for interactive elements."),
    role: z.string().describe(
      "🎯 ELEMENT TYPE: The ARIA role of the element. Common values: " +
      "'button' (clickable buttons), 'link' (navigation links), 'textbox' (text inputs), " +
      "'combobox' (dropdowns), 'checkbox', 'radio', 'dialog' (modals), 'navigation', " +
      "'banner', 'main', 'contentinfo'. Use browser_snapshot to see available roles."
    ),
    name: z.string().describe(
      "🥇 MOST RELIABLE: The accessible name of the element, which is typically its visible text content. " +
      "This is the best locator strategy for interactive elements like buttons and links. " +
      "Use the exact text users see (e.g., 'Submit', 'Sign In', 'Learn More'). " +
      "For images, use alt text. For form controls, use their calculated accessible name."
    ),
});

export const PlaceholderLocatorSchema = z.object({
  using: z.literal("placeholder").describe("Strategy: Find an input element by its placeholder text."),
  text: z.string().describe(
    "🥉 GOOD FALLBACK: The exact text of the 'placeholder' attribute. " +
    "Use this strategy when form fields lack proper labels but have descriptive placeholder text. " +
    "Enter the placeholder text exactly as it appears (e.g., 'Enter your email address'). " +
    "Works well for modern web apps that use placeholders instead of labels, " +
    "though labels are preferred for accessibility and reliability."
  ),
});

export const CssLocatorSchema = z.object({
  using: z.literal("css").describe("Strategy: Find an element using a CSS selector. Use this as a fallback when semantic locators are not available."),
  selector: z.string().describe(
    "🔧 FALLBACK STRATEGY: The CSS selector string to find the element. " +
    "\n\n" +
    "✅ PREFERRED CSS PATTERNS (stable): " +
    "• Attribute selectors: input[name='email'], button[type='submit'] " +
    "• Data attributes: [data-testid='login-button'], [data-cy='submit'] " +
    "• ID selectors: #submit-button, #email-field " +
    "• Simple class selectors: .btn-primary (if stable) " +
    "\n\n" +
    "❌ AVOID (brittle and likely to break): " +
    "• Deep DOM paths: div > div > div > button " +
    "• Position-based: :nth-child(3), :first-child " +
    "• Generated class names: .css-1x2y3z4, .MuiButton-root-123 " +
    "• Complex combinators: .header ~ .content + .sidebar " +
    "\n\n" +
    "💡 AI TIP: Get CSS selectors from browser_snapshot suggestions when possible. " +
    "Test selectors for uniqueness and stability before using in automation."
  ),
});

export const LocatorSchema = z.union([
  RefLocatorSchema,
  LabelLocatorSchema,
  AriaRoleLocatorSchema,
  PlaceholderLocatorSchema,
  CssLocatorSchema,
]).describe(
    "🎯 ELEMENT LOCATOR: A discriminated union object for locating an element on a web page. " +
    "\n\n" +
    "📋 CRITICAL WORKFLOW FOR AI: " +
    "1. ALWAYS call browser_snapshot first to get current page context " +
    "2. Review available elements and their suggested locators " +
    "3. Choose strategy based on priority: aria-role > label > placeholder > css > ref " +
    "4. Use exact text/values from the snapshot " +
    "5. Include error recovery for failed locators " +
    "\n\n" +
    "🎯 STRATEGY SELECTION GUIDE: " +
    "• Interactive elements (buttons/links): Use aria-role strategy " +
    "• Form fields with labels: Use label strategy " +
    "• Form fields with placeholders: Use placeholder strategy " +
    "• Elements with stable attributes: Use css strategy " +
    "• Debugging only: Use ref strategy " +
    "\n\n" +
    "⚠️  AVOID COMMON MISTAKES: " +
    "• Don't use ref values for production automation " +
    "• Don't guess at locator values - get them from browser_snapshot " +
    "• Don't use complex CSS selectors that break with UI changes " +
    "• Don't skip error handling when locators fail"
);

export type Locator = z.infer<typeof LocatorSchema>;
