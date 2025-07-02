// mcp/src/prompts/schema-guidance.ts
// Exposes comprehensive schema guidance via MCP prompt API

import { z } from "zod";

/**
 * 🎯 MCP PROMPT REGISTRY FOR SCHEMA GUIDANCE
 * ==========================================
 * 
 * This module exposes the comprehensive AI workflow guidance and schema
 * documentation from our tool and locator schemas via the MCP prompt API.
 * 
 * This allows AI agents to dynamically request guidance for:
 * - Browser automation workflow patterns
 * - Locator strategy selection
 * - Error recovery techniques  
 * - Form filling best practices
 * - Tool usage recommendations
 */

// Core workflow guidance from tool.schemas.ts
export const BROWSER_AUTOMATION_WORKFLOW_GUIDE = `
🎯 BROWSER AUTOMATION WORKFLOW FOR AI AGENTS
============================================

This is the definitive workflow guide for reliable browser automation using the MCP browser server.
Following this workflow dramatically improves success rates for AI agents of all capabilities.

📋 STEP-BY-STEP WORKFLOW:

1. 🗂️  TAB DISCOVERY & SETUP
   ---------------------------
   • ALWAYS start with browser_list_tabs to see available tabs
   • Use browser_set_active_tab to target the specific tab you need
   • Call browser_get_active_tab_for_automation to ensure proper setup
   
   Example sequence:
   browser_list_tabs → identify target tab → browser_set_active_tab → verify setup

2. 📸 CONTEXT GATHERING (CRITICAL!)
   ----------------------------------
   • ALWAYS call browser_snapshot before any page interactions
   • This provides: page structure, interactive elements, suggested locators
   • Never guess at locators - always get them from snapshot data
   • Take fresh snapshots after navigation or major page changes

3. 🎯 LOCATOR STRATEGY SELECTION
   -------------------------------
   Priority order (use this exact sequence):
   
   🥇 aria-role strategy (90% success rate)
   • BEST FOR: buttons, links, interactive elements
   • EXAMPLE: {using: "aria-role", role: "button", name: "Submit"}
   
   🥈 label strategy (85% success rate)  
   • BEST FOR: form fields with labels
   • EXAMPLE: {using: "label", text: "Email Address"}
   
   🥉 placeholder strategy (70% success rate)
   • BEST FOR: inputs with placeholder text but no labels
   • EXAMPLE: {using: "placeholder", text: "Enter your email"}
   
   🔧 css strategy (60% success rate)
   • FALLBACK: when semantic options aren't available
   • USE: stable attributes like [name="email"], [data-testid="submit"]
   • AVOID: complex selectors, generated class names
   
   ⚠️  ref strategy (10% success rate)
   • ONLY FOR: debugging and development
   • NEVER USE: in production automation

4. 🔄 INTERACTION PATTERNS
   -------------------------
   • For single actions: Use individual tools (browser_click, browser_type)
   • For forms: Consider browser_bulk_fill_form for efficiency
   • For complex workflows: Use browser_smart_fill_form with semantic data
   • Always handle errors gracefully with retry logic

5. ✅ VERIFICATION & ERROR RECOVERY
   ----------------------------------
   • Take snapshots after interactions to verify success
   • Check browser_get_console_logs if unexpected behavior occurs
   • Use browser_screenshot for visual debugging
   • Implement retry logic with fresh snapshots

🚨 CRITICAL SUCCESS FACTORS:

❌ AVOID THESE COMMON MISTAKES:
• Skipping browser_snapshot before interactions
• Using ref locators in production automation  
• Guessing at locator values instead of using snapshot data
• Not handling errors or implementing retry logic
• Using complex CSS selectors that break with UI changes

✅ ENSURE THESE FOR SUCCESS:
• Always get context with browser_snapshot first
• Use highest-priority locator strategy available
• Include error recovery in automation logic
• Test locators for uniqueness and stability
• Handle dynamic content with waits and fresh snapshots

💡 AI EFFICIENCY TIPS:
• Use bulk form filling for multi-field operations
• Combine actions where possible to reduce tool calls
• Cache snapshot data for multiple interactions on same page
• Use semantic data keys for smart form filling
• Monitor console logs for debugging unexpected failures
`;

// Locator strategy guidance from locator.schemas.ts  
export const LOCATOR_STRATEGY_GUIDE = `
🔍 LOCATOR STRATEGY GUIDE FOR AI AGENTS
=======================================

This guide helps AI choose the most reliable locator strategies for browser automation.
Following these recommendations dramatically improves automation success rates.

📋 PRIORITY ORDER (Use this exact order):

1. 🥇 ARIA-ROLE STRATEGY (Most Reliable - ~90% Success)
   ---------------------------------------------------
   • BEST FOR: Buttons, links, dialogs, navigation, interactive elements
   • WHY: Uses semantic web standards that persist across UI changes
   • FORMAT: {using: "aria-role", role: "button", name: "Submit"}
   • SUCCESS RATE: ~90% for properly labeled interactive elements
   
   Common role values:
   - "button" (clickable buttons)
   - "link" (navigation links)  
   - "textbox" (text inputs)
   - "combobox" (dropdowns)
   - "checkbox", "radio"
   - "dialog" (modals)
   - "navigation", "banner", "main"

2. 🥈 LABEL STRATEGY (Excellent for Forms - ~85% Success)
   -------------------------------------------------------
   • BEST FOR: Input fields, textareas, select boxes, checkboxes
   • WHY: Form labels are stable and required for accessibility
   • FORMAT: {using: "label", text: "Email Address"}
   • SUCCESS RATE: ~85% for properly labeled form elements
   
   Tips:
   - Use exact label text as it appears
   - Add elementType for disambiguation: elementType: "textbox"
   - Works for all form controls with associated labels

3. 🥉 PLACEHOLDER STRATEGY (Good Fallback - ~70% Success)
   -------------------------------------------------------
   • BEST FOR: Input fields without labels but with placeholder text
   • WHY: Placeholder text is usually stable across updates
   • FORMAT: {using: "placeholder", text: "Enter your email"}
   • SUCCESS RATE: ~70% when placeholder text is descriptive
   
   Use when:
   - Form fields lack proper labels
   - Placeholder text is descriptive and stable
   - Modern web apps that rely on placeholders

4. 🔧 CSS STRATEGY (Fallback Only - ~60% Success)
   -----------------------------------------------
   • BEST FOR: When semantic strategies aren't available
   • FORMAT: {using: "css", selector: "input[name='email']"}
   • SUCCESS RATE: ~60% when using stable attributes
   
   ✅ PREFERRED CSS PATTERNS (stable):
   • Attribute selectors: input[name='email'], button[type='submit']
   • Data attributes: [data-testid='login-button'], [data-cy='submit']
   • ID selectors: #submit-button, #email-field
   • Simple class selectors: .btn-primary (if stable)
   
   ❌ AVOID (brittle and likely to break):
   • Deep DOM paths: div > div > div > button
   • Position-based: :nth-child(3), :first-child
   • Generated class names: .css-1x2y3z4, .MuiButton-root-123
   • Complex combinators: .header ~ .content + .sidebar

5. ⚠️  REF STRATEGY (Debugging Only - ~10% Success)
   -------------------------------------------------
   • NEVER USE: For production automation
   • ONLY FOR: Quick debugging and development
   • WHY: Temporary IDs that change between page loads
   • FORMAT: {using: "ref", value: "s1e40"}
   • SUCCESS RATE: ~10% in real scenarios

🚨 CRITICAL WORKFLOW FOR LOCATORS:

1. ALWAYS call browser_snapshot first to get current page context
2. Review available elements and their suggested locators
3. Choose strategy based on priority: aria-role > label > placeholder > css > ref
4. Use exact text/values from the snapshot
5. Include error recovery for failed locators

💡 ERROR RECOVERY PATTERNS:
• Locator not found → Take fresh snapshot, check if page changed
• Multiple matches → Add elementType or use more specific selector
• Element not interactive → Wait for page load, check element state
• Timing issues → Brief wait + retry with fresh snapshot

🎯 STRATEGY SELECTION DECISION TREE:

Is it a button/link/interactive element?
  └─ YES: Use aria-role strategy with appropriate role

Is it a form field with a visible label?
  └─ YES: Use label strategy with exact label text

Is it a form field with placeholder text but no label?
  └─ YES: Use placeholder strategy with exact placeholder

Does the element have stable attributes (name, id, data-*)?
  └─ YES: Use css strategy with attribute selectors

None of the above work?
  └─ Use css strategy with simple, stable selectors
  └─ Last resort: Try ref strategy for debugging only

Remember: Get locator values from browser_snapshot, never guess!
`;

// Form filling best practices
export const FORM_FILLING_GUIDE = `
📋 BULK FORM FILLING STRATEGIES
===============================

Comprehensive guide for efficient form automation using MCP browser tools.

🚀 BULK FILLING APPROACHES:

1. 🎯 SMART FORM FILLING (Recommended)
   -----------------------------------
   Use browser_smart_fill_form for one-shot form completion:
   
   • Automatically discovers all form fields
   • Maps your data to fields using semantic matching
   • Handles field dependencies and validation
   • Provides detailed success/failure reporting
   
   Example:
   {
     data: {
       email: "user@example.com",
       firstName: "John", 
       lastName: "Doe",
       phone: "555-1234"
     },
     mappingStrategy: "auto",
     submitAfter: true
   }

2. 🔍 DISCOVERY + BULK FILLING
   -----------------------------
   Two-step approach for complex forms:
   
   Step 1: browser_discover_form_fields
   • Analyzes page for all fillable fields
   • Provides multiple locator strategies
   • Groups fields by form context
   
   Step 2: browser_bulk_fill_form  
   • Fills multiple fields efficiently
   • Built-in error recovery
   • Progress tracking and validation

3. 🎛️  INDIVIDUAL FIELD APPROACH
   --------------------------------
   For simple forms or special cases:
   • browser_type for text inputs
   • browser_select_option for dropdowns
   • browser_click for checkboxes/radio buttons

🔄 WORKFLOW BEST PRACTICES:

1. Page Preparation:
   browser_snapshot → identify forms → choose strategy

2. Data Mapping:
   • Use semantic keys: firstName, lastName, email, phone
   • Match data structure to form field expectations
   • Handle special field types (dates, numbers, etc.)

3. Error Handling:
   • Set stopOnError: false to continue on failures
   • Use validateAfter: true for critical fields
   • Implement retry logic for failed fields

4. Form Submission:
   • Use submitAfter: true for automatic submission
   • Or use browser_click on submit button after filling
   • Verify submission success with fresh snapshot

💡 EFFICIENCY TIPS:

• Use browser_smart_fill_form for most use cases
• Cache discovered form structure for repeated operations
• Group related fields for batch processing
• Handle dynamic fields (country → state dependencies)
• Monitor validation messages for real-time feedback

🚨 COMMON PITFALLS TO AVOID:

• Don't skip form discovery - always understand structure first
• Don't use fragile locators that break with UI changes
• Don't ignore field validation and error states
• Don't submit forms without verifying all required fields
• Don't hardcode field mapping - use semantic approaches
`;

// Error recovery patterns
export const ERROR_RECOVERY_GUIDE = `
🔧 ERROR RECOVERY PATTERNS FOR BROWSER AUTOMATION
================================================

Comprehensive guide for handling common automation failures and implementing robust recovery strategies.

🚨 COMMON FAILURE SCENARIOS & SOLUTIONS:

1. 🎯 LOCATOR NOT FOUND
   ---------------------
   Symptoms: "Element not found", "No matching elements"
   
   Recovery Strategy:
   • Take fresh browser_snapshot to check current page state
   • Verify the page hasn't changed or redirected
   • Check if dynamic content is still loading
   • Try alternative locator strategies from priority list
   • Use browser_wait + fresh snapshot for slow-loading content
   
   Prevention:
   • Always use browser_snapshot before interactions
   • Prefer stable locators (aria-role, label) over fragile ones
   • Implement retry logic with fresh context gathering

2. 🔄 ELEMENT NOT INTERACTIVE
   ---------------------------
   Symptoms: "Element not clickable", "Element is disabled"
   
   Recovery Strategy:
   • Check element state in fresh snapshot
   • Wait for element to become enabled/visible
   • Scroll element into view if needed
   • Check for overlapping elements or modals
   • Try browser_hover before clicking to trigger states
   
   Prevention:
   • Verify element states before interaction
   • Handle loading states and dynamic content
   • Use appropriate waits for animations/transitions

3. 📝 FORM FILLING FAILURES
   -------------------------
   Symptoms: Text not entered, wrong values, validation errors
   
   Recovery Strategy:
   • Clear existing field content first
   • Try clicking field before typing
   • Use browser_press_key to trigger field focus
   • Check for client-side validation requirements
   • Verify field accepts the data type/format
   
   Prevention:
   • Use browser_discover_form_fields to understand requirements
   • Validate data format before filling
   • Handle field dependencies (country → state)

4. 🌐 PAGE LOADING ISSUES  
   ------------------------
   Symptoms: Incomplete content, navigation failures
   
   Recovery Strategy:
   • Use browser_wait for page load completion
   • Check browser_get_console_logs for JavaScript errors
   • Verify network connectivity and target URL
   • Take browser_screenshot for visual debugging
   • Retry navigation after brief wait
   
   Prevention:
   • Wait for page load indicators
   • Monitor console logs for errors
   • Handle single-page app navigation differences

5. 🎛️  DROPDOWN/SELECT FAILURES
   ------------------------------
   Symptoms: Option not selected, dropdown not opening
   
   Recovery Strategy:
   • Try clicking dropdown to open it first
   • Use exact option text vs. value attribute
   • Check if options loaded dynamically
   • Try browser_hover to reveal dropdown menu
   • Use browser_press_key (ArrowDown) for navigation
   
   Prevention:
   • Wait for dropdown options to load
   • Use browser_discover_form_fields to see available options
   • Test both visible text and value attribute matching

🔄 RECOVERY WORKFLOW PATTERN:

1. **Immediate Recovery**:
   • Take fresh browser_snapshot
   • Check browser_get_console_logs for errors
   • Verify current page state matches expectations

2. **Context Re-establishment**:
   • Confirm correct tab is active
   • Navigate back to known good state if needed
   • Re-run discovery tools to update context

3. **Alternative Approach**:
   • Try different locator strategy
   • Use manual element discovery
   • Break complex operations into smaller steps

4. **Escalation**:
   • Take browser_screenshot for debugging
   • Log detailed error information
   • Consider human intervention for edge cases

💡 PROACTIVE ERROR PREVENTION:

✅ **Defensive Programming**:
• Always check element existence before interaction
• Implement timeout logic for slow operations
• Use stable, semantic locators
• Handle both success and failure cases explicitly

✅ **Context Awareness**:
• Monitor page state changes during automation
• Handle dynamic content and lazy loading
• Account for varying network conditions
• Test across different page states and conditions

✅ **Graceful Degradation**:
• Continue with partial success when possible
• Provide meaningful error messages
• Allow manual intervention as fallback
• Log sufficient information for debugging

🎯 **Success Metrics**:
• Measure automation success rates
• Track common failure patterns
• Monitor recovery effectiveness
• Continuously improve based on real-world usage

Remember: Robust automation expects failures and handles them gracefully!
`;

// Prompt schemas for MCP server
export const SCHEMA_GUIDANCE_PROMPTS = [
  {
    name: "browser-automation-workflow",
    description: "Complete workflow guide for reliable browser automation using MCP browser tools",
    arguments: {
      focus: {
        type: "string" as const,
        description: "Optional focus area: 'setup', 'locators', 'interactions', 'errors', or 'all'",
        enum: ["setup", "locators", "interactions", "errors", "all"]
      }
    }
  },
  {
    name: "locator-strategy-guide", 
    description: "Comprehensive guide for choosing the most reliable element locator strategies",
    arguments: {
      elementType: {
        type: "string" as const,
        description: "Optional element type for specific guidance: 'button', 'form', 'link', 'dropdown'",
        enum: ["button", "form", "link", "dropdown", "any"]
      }
    }
  },
  {
    name: "form-filling-strategies",
    description: "Best practices and strategies for bulk form filling and automation",
    arguments: {
      approach: {
        type: "string" as const, 
        description: "Preferred approach: 'smart', 'bulk', 'individual', or 'all'",
        enum: ["smart", "bulk", "individual", "all"]
      }
    }
  },
  {
    name: "error-recovery-patterns",
    description: "Comprehensive error handling and recovery strategies for browser automation",
    arguments: {
      errorType: {
        type: "string" as const,
        description: "Specific error type for focused guidance: 'locator', 'interaction', 'loading', 'form', or 'all'", 
        enum: ["locator", "interaction", "loading", "form", "all"]
      }
    }
  }
];

// Generate prompt responses based on focus areas
export function generatePromptResponse(promptName: string, args: any): string {
  switch (promptName) {
    case "browser-automation-workflow":
      const focus = args?.focus || "all";
      if (focus === "all") return BROWSER_AUTOMATION_WORKFLOW_GUIDE;
      
      // Extract specific sections based on focus
      if (focus === "setup") {
        return BROWSER_AUTOMATION_WORKFLOW_GUIDE.split("2. 📸 CONTEXT GATHERING")[0];
      } else if (focus === "locators") {
        return BROWSER_AUTOMATION_WORKFLOW_GUIDE.split("3. 🎯 LOCATOR STRATEGY SELECTION")[1].split("4. 🔄 INTERACTION PATTERNS")[0];
      }
      // Add other focus areas as needed
      return BROWSER_AUTOMATION_WORKFLOW_GUIDE;
      
    case "locator-strategy-guide":
      return LOCATOR_STRATEGY_GUIDE;
      
    case "form-filling-strategies":
      return FORM_FILLING_GUIDE;
      
    case "error-recovery-patterns":
      return ERROR_RECOVERY_GUIDE;
      
    default:
      return "Unknown prompt requested. Available prompts: browser-automation-workflow, locator-strategy-guide, form-filling-strategies, error-recovery-patterns";
  }
}
