import { Context } from "@/context";
import { ToolResult } from "@/tools/tool";

/**
 * Converts a TabInfo object to a YAML string for YAML output.
 * All fields from the TabInfo protocol are included and clearly labeled.
 *
 * @param tabInfo - The TabInfo object (may be undefined/null)
 * @returns YAML string
 */
function tabInfoToYaml(tabInfo: any): string {
  if (!tabInfo) return 'tabInfo: null';
  return [
    'tabInfo:',
    `  tabId: ${tabInfo.tabId}`,
    `  title: "${tabInfo.title}"`,
    `  url: "${tabInfo.url}"`,
    `  isActiveForAutomation: ${tabInfo.isActiveForAutomation}`,
    `  isActiveInWindow: ${tabInfo.isActiveInWindow}`,
    `  isAudible: ${tabInfo.isAudible}`,
    `  isPinned: ${tabInfo.isPinned}`,
  ].join('\n');
}

/**
 * Captures a Webpage Snapshot with a clear, explicit structure for AI and human use.
 *
 * - Calls the browser_snapshot tool, which returns both the accessibility tree and the full tab info.
 * - The output format is controlled by the 'format' flag: 'json' (default) or 'yaml'.
 * - In 'json' mode, returns the browser_snapshot result as a plain object (no transformation).
 * - In 'yaml' mode, formats the output as a YAML code block for human readability.
 *
 * @param context - The automation context (provides sendSocketMessage)
 * @param status - Optional status message to prepend to the output (only used for YAML)
 * @param format - 'json' (default) or 'yaml'
 * @returns ToolResult with a single text block (YAML) or the raw result (JSON)
 */
export async function captureAriaSnapshot(
  context: Context,
  status: string = "",
  format: "json" | "yaml" = "json"
): Promise<ToolResult> {
  const result = await context.sendSocketMessage("browser_snapshot", {});
  if (format === "json") {
    // Return the browser_snapshot result as a plain object for maximum fidelity and efficiency
    return  {
      content: [
        {
          type: "text",
          result,
        },
      ],
    };
  } else {
    // YAML formatting for human readability
    const tabInfo = result?.activeTab?.tab;
    const snapshot = result?.snapshot;
    const text =
      `${status ? `${status}\n` : ""}` +
      `Webpage Snapshot:\n` +
      `\u0060\u0060\u0060yaml\n` +
      `webpageSnapshot:\n` +
      `${tabInfoToYaml(tabInfo).replace(/\n/g, '\n  ')}\n` +
      `  accessibilityTree: |\n` +
      `    ${typeof snapshot === 'string' ? snapshot.replace(/\n/g, '\n    ') : JSON.stringify(snapshot, null, 2).replace(/\n/g, '\n    ')}\n` +
      `\u0060\u0060\u0060\n`;
    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  }
}
