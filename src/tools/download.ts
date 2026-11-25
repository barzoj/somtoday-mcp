import {
  AttachmentError,
  downloadAttachment,
  downloadDir,
  isAllowedUrl,
  resolveBestanddataUrl,
} from "../api/download.js";
import { requireSession, type ToolContext } from "./context.js";
import {
  errorResult,
  jsonResult,
  withToolErrors,
  type ToolResult,
} from "./result.js";

export type DownloadArgs = {
  url?: string;
  bestanddataId?: string;
  fileName?: string;
  save?: boolean;
};

/**
 * Save an attachment to the download directory. Takes the attachment's
 * `fileUrl` (allow-listed hosts, fetched without a token) or its
 * `bestanddataId` (a signed link is requested from Somtoday with the session).
 * Returns path and metadata only; no text extraction.
 */
export async function downloadAttachmentTool(
  ctx: ToolContext,
  args: DownloadArgs,
): Promise<ToolResult> {
  const url = args.url?.trim() || undefined;
  const bestanddataId = args.bestanddataId?.trim() || undefined;
  if (!url && !bestanddataId) {
    return errorResult(
      "download_attachment: pass url (fileUrl) or bestanddataId of an attachment",
    );
  }
  const options = {
    saveDir: args.save === false ? undefined : downloadDir(),
    fallbackName: args.fileName,
  };
  if (url && (!bestanddataId || isAllowedUrl(url))) {
    return attachmentErrors(async () =>
      jsonResult(await downloadAttachment(ctx.fetchFn, url, options)),
    );
  }
  return withToolErrors(async () => {
    const missing = await requireSession(ctx);
    if (missing) return missing;
    return attachmentErrors(async () => {
      const signed = await resolveBestanddataUrl(ctx.client, bestanddataId!);
      const result = await downloadAttachment(ctx.fetchFn, signed.href, {
        ...options,
        extraHosts: [signed.hostname.toLowerCase()],
      });
      return jsonResult({ ...result, bestanddataId });
    });
  });
}

async function attachmentErrors(
  run: () => Promise<ToolResult>,
): Promise<ToolResult> {
  try {
    return await run();
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
