// mcp/src/tools/bulk.ts
// Bulk/batch form filling strategies using existing MCP server API

import { z } from "zod";
import { LocatorSchema } from "@/types/mcp/locator.schemas";
import { makeTool } from "./common.js";
import type { Tool, ToolFactory } from "@/types/mcp/tool.schemas";

/**
 * 🚀 BULK FORM FILLING STRATEGY
 * =============================
 * 
 * This tool enables efficient batch processing of form fields using the existing
 * MCP browser automation infrastructure. It provides strategies for:
 * 
 * 1. **Sequential Form Filling**: Fill multiple fields in order with error recovery
 * 2. **Parallel Field Discovery**: Identify all form fields efficiently  
 * 3. **Smart Field Mapping**: Match data to form fields using multiple strategies
 * 4. **Batch Validation**: Verify all fields were filled correctly
 * 
 * 💡 **AI WORKFLOW BENEFITS**:
 * - Reduces tool call overhead (1 call vs N field calls)
 * - Built-in error recovery and retry logic
 * - Automatic field discovery and mapping
 * - Progress tracking and partial success handling
 * 
 * 🎯 **USE CASES**:
 * - Contact forms, registration forms, checkout processes
 * - Data entry automation, form testing, bulk updates
 * - Multi-step wizards, complex applications
 */

// Schema for individual field operations
const FormFieldSchema = z.object({
  locator: LocatorSchema.describe("Locator to find the form field"),
  value: z.string().describe("Value to enter into the field"),
  fieldType: z.enum(['text', 'select', 'checkbox', 'radio']).optional().describe("Type of field for specialized handling"),
  required: z.boolean().optional().default(true).describe("Whether this field is required for form completion"),
  validateAfter: z.boolean().optional().default(false).describe("Whether to validate the field value after filling"),
});

// Bulk form filling tool schema
const BulkFillFormTool = z.object({
  name: z.literal("browser_bulk_fill_form"),
  description: z.literal(
    "🚀 BULK FORM AUTOMATION: Efficiently fills multiple form fields in sequence with built-in error recovery. " +
    "\n\n" +
    "🎯 EFFICIENCY GAINS: Reduces tool calls from N individual operations to 1 bulk operation. " +
    "Includes automatic field discovery, smart retry logic, and progress tracking. " +
    "\n\n" +
    "📋 WORKFLOW: " +
    "1. Takes fresh snapshot to get current form state " +
    "2. Validates all locators before starting " +
    "3. Fills fields sequentially with error recovery " +
    "4. Optionally validates each field after filling " +
    "5. Returns detailed results with success/failure status " +
    "\n\n" +
    "🔧 FIELD TYPES SUPPORTED: " +
    "• text: Standard text inputs and textareas " +
    "• select: Dropdown menus and combo boxes " +
    "• checkbox: Boolean checkbox fields " +
    "• radio: Radio button selections " +
    "\n\n" +
    "⚠️  ERROR RECOVERY: Continues processing remaining fields even if some fail. " +
    "Returns detailed error information for debugging failed fields. " +
    "\n\n" +
    "💡 AI TIP: Use browser_snapshot first to identify all form fields, then map your data " +
    "to the appropriate locators. Consider field dependencies (e.g., country affects state options)."
  ),
  arguments: z.object({
    fields: z.array(FormFieldSchema).describe("Array of form fields to fill in sequence"),
    submitAfter: z.boolean().optional().default(false).describe("Whether to submit the form after filling all fields"),
    stopOnError: z.boolean().optional().default(false).describe("Whether to stop processing if any field fails (default: continue with remaining fields)"),
    validateAll: z.boolean().optional().default(false).describe("Whether to validate all fields after filling (overrides individual validateAfter settings)"),
    delayBetweenFields: z.number().optional().default(100).describe("Milliseconds to wait between field operations (default: 100ms)"),
  }),
  result: z.object({
    success: z.boolean().describe("Whether the overall operation was successful"),
    totalFields: z.number().describe("Total number of fields processed"),
    successfulFields: z.number().describe("Number of fields filled successfully"),
    failedFields: z.number().describe("Number of fields that failed"),
    results: z.array(z.object({
      fieldIndex: z.number(),
      locator: LocatorSchema,
      value: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
      validationResult: z.object({
        validated: z.boolean(),
        expectedValue: z.string(),
        actualValue: z.string().optional(),
        matches: z.boolean().optional(),
      }).optional(),
    })).describe("Detailed results for each field operation"),
    submissionResult: z.object({
      attempted: z.boolean(),
      success: z.boolean(),
      error: z.string().optional(),
    }).optional().describe("Results of form submission if attempted"),
  }),
});

// Form discovery tool for identifying all fillable fields
const DiscoverFormFieldsTool = z.object({
  name: z.literal("browser_discover_form_fields"),
  description: z.literal(
    "🔍 FORM DISCOVERY: Analyzes the current page to identify all fillable form fields with suggested locators. " +
    "\n\n" +
    "🎯 BULK PREPARATION: Essential first step for bulk form filling. " +
    "Identifies all form elements and provides multiple locator strategies for each field. " +
    "\n\n" +
    "📋 FIELD ANALYSIS: " +
    "• Detects input types (text, email, password, number, etc.) " +
    "• Identifies select dropdowns and their options " +
    "• Finds checkboxes and radio button groups " +
    "• Suggests optimal locator strategies for each field " +
    "• Reports current field values and validation states " +
    "\n\n" +
    "💡 AI WORKFLOW: Use this tool first, then map your data to the discovered fields, " +
    "finally call browser_bulk_fill_form with the mapped field data. " +
    "\n\n" +
    "🔧 RETURNS: Structured data perfect for bulk form filling preparation."
  ),
  arguments: z.object({
    includeCurrentValues: z.boolean().optional().default(true).describe("Whether to include current field values in the analysis"),
    groupByForm: z.boolean().optional().default(true).describe("Whether to group fields by their parent form elements"),
    suggestLocators: z.boolean().optional().default(true).describe("Whether to suggest multiple locator strategies for each field"),
  }),
  result: z.object({
    success: z.boolean(),
    forms: z.array(z.object({
      formLocator: LocatorSchema.optional(),
      formName: z.string().optional(),
      formAction: z.string().optional(),
      fields: z.array(z.object({
        fieldType: z.enum(['text', 'email', 'password', 'number', 'tel', 'url', 'select', 'checkbox', 'radio', 'textarea']),
        label: z.string().optional(),
        placeholder: z.string().optional(),
        name: z.string().optional(),
        id: z.string().optional(),
        currentValue: z.string().optional(),
        required: z.boolean().optional(),
        disabled: z.boolean().optional(),
        suggestedLocators: z.array(LocatorSchema).describe("Multiple locator strategies ordered by reliability"),
        options: z.array(z.object({
          value: z.string(),
          text: z.string(),
          selected: z.boolean().optional(),
        })).optional().describe("For select, radio, and checkbox fields"),
      })),
    })).describe("All discovered forms and their fields"),
    totalFields: z.number(),
    error: z.string().optional(),
  }),
});

// Implementation using the existing tool infrastructure
export const bulkFillForm: ToolFactory = makeTool(BulkFillFormTool, {
  snapshot: true, // Always take snapshot after bulk operations
  payloadTransform: (params: any) => ({
    action: 'bulk_fill_form',
    ...params,
  }),
  successMessage: ({ fields, submitAfter }: any) => 
    `Bulk filled ${fields.length} form fields${submitAfter ? ' and submitted form' : ''}`,
});

export const discoverFormFields: Tool = makeTool(DiscoverFormFieldsTool, {
  snapshot: false, // Discovery doesn't change page state
  payloadTransform: (params: any) => ({
    action: 'discover_form_fields',
    ...params,
  }),
  successMessage: () => "Discovered form fields successfully",
});

// Smart form filling strategy tool
const SmartFormFillTool = z.object({
  name: z.literal("browser_smart_fill_form"),
  description: z.literal(
    "🧠 INTELLIGENT FORM FILLING: Combines discovery and bulk filling with smart field mapping. " +
    "\n\n" +
    "🎯 ONE-SHOT SOLUTION: Discovers form fields, maps your data intelligently, " +
    "and fills the form in a single operation. Perfect for AI agents. " +
    "\n\n" +
    "🔍 SMART MAPPING STRATEGIES: " +
    "• Label matching: Maps data to fields by label text " +
    "• Name/ID matching: Uses form field names and IDs " +
    "• Placeholder matching: Matches against placeholder text " +
    "• Semantic matching: Uses field types to infer data mapping " +
    "\n\n" +
    "📋 WORKFLOW: " +
    "1. Automatically discovers all form fields " +
    "2. Maps provided data to fields using multiple strategies " +
    "3. Fills fields in optimal order (dependencies handled) " +
    "4. Validates results and provides detailed feedback " +
    "\n\n" +
    "💡 AI TIP: Provide data with semantic keys (email, firstName, lastName, etc.) " +
    "for best automatic mapping results."
  ),
  arguments: z.object({
    data: z.record(z.string(), z.string()).describe("Key-value pairs of data to fill. Keys should be semantic (email, firstName, etc.)"),
    mappingStrategy: z.enum(['label', 'name', 'semantic', 'auto']).optional().default('auto').describe("Strategy for mapping data to form fields"),
    submitAfter: z.boolean().optional().default(false).describe("Whether to submit the form after filling"),
    strictMode: z.boolean().optional().default(false).describe("Whether to require all data to be mapped (fails if any data unused)"),
  }),
  result: z.object({
    success: z.boolean(),
    discoveredFields: z.number(),
    mappedFields: z.number(),
    filledFields: z.number(),
    unmappedData: z.array(z.string()).describe("Data keys that couldn't be mapped to form fields"),
    mappingResults: z.array(z.object({
      dataKey: z.string(),
      fieldLabel: z.string().optional(),
      locator: LocatorSchema,
      mappingStrategy: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    })),
    submissionResult: z.object({
      attempted: z.boolean(),
      success: z.boolean(),
      error: z.string().optional(),
    }).optional(),
  }),
});

export const smartFillForm: ToolFactory = makeTool(SmartFormFillTool, {
  snapshot: true,
  payloadTransform: (params: any) => ({
    action: 'smart_fill_form',
    ...params,
  }),
  successMessage: ({ data }: any) => 
    `Smart-filled form with ${Object.keys(data).length} data fields`,
});
