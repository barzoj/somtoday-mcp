import {
  ATTACHMENT_HOSTS_ENV,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_REDIRECTS,
  ATTACHMENT_MAX_TEXT,
  ATTACHMENT_TIMEOUT_MS,
} from "../constants.js";
import { htmlToPlain } from "../html.js";

export class AttachmentError extends Error {}

const BASE_SUFFIXES = [".somtoday.nl"];

function allowedRules(env: string | undefined): string[] {
  const extra = (env ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return [...BASE_SUFFIXES, ...extra];
}

export function isAllowedUrl(
  raw: string | URL,
  env = process.env[ATTACHMENT_HOSTS_ENV],
): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return allowedRules(env).some((rule) =>
    rule.startsWith(".")
      ? host.endsWith(rule) && host.length > rule.length
      : host === rule,
  );
}

export type Attachment = {
  host: string;
  contentType: string;
  fileName?: string;
  bytes: number;
  text?: string;
  truncated?: boolean;
  pages?: number;
  note?: string;
};

function fileNameFrom(
  disposition: string | null,
  url: URL,
  fromPath = true,
): string | undefined {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  if (!fromPath) return undefined;
  const last = url.pathname.split("/").pop();
  return last ? decodeURIComponent(last) : undefined;
}

async function readCapped(
  response: Response,
  max: number,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > max) {
    await response.body?.cancel();
    throw new AttachmentError(
      `attachment is larger than ${Math.round(max / 1024 / 1024)} MB`,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new AttachmentError(
        `attachment is larger than ${Math.round(max / 1024 / 1024)} MB`,
      );
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const TEXT_TYPES =
  /^(text\/|application\/(json|xml|csv|x-csv|rtf)|.*\+json|.*\+xml)/i;

function truncate(text: string): { text: string; truncated?: boolean } {
  return text.length > ATTACHMENT_MAX_TEXT
    ? { text: text.slice(0, ATTACHMENT_MAX_TEXT), truncated: true }
    : { text };
}

async function extractPdf(
  bytes: Uint8Array,
): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { text: String(text).trim(), pages: totalPages };
}

/**
 * Download an attachment from an allow-listed host (GET only, no Authorization header,
 * every redirect re-checked) and extract text where possible.
 */
export async function downloadAttachment(
  fetchFn: typeof fetch,
  rawUrl: string,
  options: { maxBytes?: number; env?: string } = {},
): Promise<Attachment> {
  const env = options.env ?? process.env[ATTACHMENT_HOSTS_ENV];
  let url = new URL(rawUrl);
  for (let hop = 0; ; hop += 1) {
    if (!isAllowedUrl(url, env)) {
      throw new AttachmentError(
        `host ${url.hostname} is not allowed (https *.somtoday.nl; add hosts via ${ATTACHMENT_HOSTS_ENV})`,
      );
    }
    const response = await fetchFn(url, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "*/*" },
      signal: AbortSignal.timeout(ATTACHMENT_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || hop >= ATTACHMENT_MAX_REDIRECTS) {
        throw new AttachmentError("too many or invalid redirects");
      }
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AttachmentError(`download failed: HTTP ${response.status}`);
    }
    return readFile(response, url, options.maxBytes);
  }
}

/** Read a successful response (size-capped) and extract text where possible. */
export async function readFile(
  response: Response,
  url: URL,
  maxBytes = ATTACHMENT_MAX_BYTES,
  fallbackName?: string,
): Promise<Attachment> {
  const bytes = await readCapped(response, maxBytes);
  const contentType = (
    response.headers.get("content-type") ?? "application/octet-stream"
  )
    .split(";")[0]!
    .trim()
    .toLowerCase();
  const fileName =
    fileNameFrom(response.headers.get("content-disposition"), url, false) ??
    fallbackName ??
    fileNameFrom(null, url);
  const base: Attachment = {
    host: url.hostname,
    contentType,
    fileName,
    bytes: bytes.byteLength,
  };
  const isPdf =
    contentType === "application/pdf" ||
    (contentType === "application/octet-stream" &&
      /\.pdf$/i.test(fileName ?? ""));
  if (isPdf) {
    try {
      const { text, pages } = await extractPdf(bytes);
      return {
        ...base,
        pages,
        ...truncate(text),
        note: text ? undefined : "PDF has no text layer (scanned?)",
      };
    } catch {
      return { ...base, note: "could not read PDF text" };
    }
  }
  if (TEXT_TYPES.test(contentType)) {
    const decoded = new TextDecoder("utf-8").decode(bytes);
    const text = /html/.test(contentType) ? htmlToPlain(decoded) : decoded;
    return { ...base, ...truncate(text) };
  }
  return {
    ...base,
    note: "binary file; text extraction not supported for this type",
  };
}
