import { AttachmentError, downloadAttachment } from "../api/download.js";
import type { ToolContext } from "./context.js";
import { errorResult, jsonResult, type ToolResult } from "./result.js";

export async function downloadAttachmentTool(
  ctx: ToolContext,
  args: { url: string },
): Promise<ToolResult> {
  try {
    return jsonResult(await downloadAttachment(ctx.fetchFn, args.url));
  } catch (error) {
    if (error instanceof AttachmentError || error instanceof TypeError) {
      return errorResult(`download_attachment: ${error.message}`);
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResult("download_attachment: timed out");
    }
    throw error;
  }
}
