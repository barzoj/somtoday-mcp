import { mkdir, open as openFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ATTACHMENT_HOSTS_ENV,
  DOWNLOAD_DIR_ENV,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_REDIRECTS,
  ATTACHMENT_MAX_TEXT,
  ATTACHMENT_TIMEOUT_MS,
} from "../constants.js";
import { htmlToPlain } from "../html.js";
import type { ApiClient } from "./client.js";

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
  extraHosts: string[] = [],
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
  return [...allowedRules(env), ...extraHosts].some((rule) =>
    rule.startsWith(".")
      ? host.endsWith(rule) && host.length > rule.length
      : host === rule,
  );
}

export type Attachment = {
  host: string;
  /** Absolute path of the saved copy (download_attachment only). */
  savedPath?: string;
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
export type DownloadOptions = ReadOptions & {
  maxBytes?: number;
  env?: string;
  /** Hosts trusted for this one call (the host of a signed link from the API). */
  extraHosts?: string[];
  fallbackName?: string;
};

export async function downloadAttachment(
  fetchFn: typeof fetch,
  rawUrl: string,
  options: DownloadOptions = {},
): Promise<Attachment> {
  const env = options.env ?? process.env[ATTACHMENT_HOSTS_ENV];
  let url = new URL(rawUrl);
  for (let hop = 0; ; hop += 1) {
    if (!isAllowedUrl(url, env, options.extraHosts)) {
      throw new AttachmentError(
        `host ${url.hostname} is not allowed (https *.somtoday.nl; add hosts via ${ATTACHMENT_HOSTS_ENV}, or pass the attachment's bestanddataId)`,
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
    return readFile(response, url, options.maxBytes, options.fallbackName, {
      saveDir: options.saveDir,
      extractText: options.extractText,
    });
  }
}

/** Default save directory: `$SOMTODAY_MCP_DOWNLOAD_DIR`, else `~/Downloads/somtoday-mcp`. */
export function downloadDir(env = process.env[DOWNLOAD_DIR_ENV]): string {
  const configured = env?.trim();
  return configured || join(homedir(), "Downloads", "somtoday-mcp");
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

/**
 * A safe file name: no directories, no control or reserved characters, no
 * leading dots, at most 150 characters, extension kept.
 */
export function sanitizeFileName(raw: string | undefined): string {
  let name = (raw ?? "").split(/[\\/]/).pop() ?? "";
  name = name
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex -- strip control characters from file names
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "");
  if (WINDOWS_RESERVED.test(name)) name = `_${name}`;
  if (name.length > 150) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : "";
    name = name.slice(0, 150 - ext.length) + ext;
  }
  return name || "attachment";
}

/** Write without overwriting: `name.pdf`, then `name (1).pdf`, `name (2).pdf` … */
async function saveFile(
  dir: string,
  name: string,
  bytes: Uint8Array,
): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 0; n < 1000; n += 1) {
    const path = join(dir, n === 0 ? name : `${stem} (${n})${ext}`);
    let handle;
    try {
      handle = await openFile(path, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
    return path;
  }
  throw new AttachmentError("could not find a free file name");
}

export type ReadOptions = {
  /** Save a copy in this directory and report `savedPath`. */
  saveDir?: string;
  /** Extract text (PDF, Word .docx, text/HTML/CSV/JSON). Default true. */
  extractText?: boolean;
};

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({
    buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  });
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

/** Read a successful response (size-capped), optionally save it, and extract text where possible. */
export async function readFile(
  response: Response,
  url: URL,
  maxBytes = ATTACHMENT_MAX_BYTES,
  fallbackName?: string,
  options: ReadOptions = {},
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
  if (options.saveDir) {
    base.savedPath = await saveFile(
      options.saveDir,
      sanitizeFileName(fileName),
      bytes,
    );
  }
  if (options.extractText === false) return base;
  const isDocx =
    contentType === DOCX_TYPE ||
    (/^application\/(octet-stream|zip|x-zip-compressed)$/.test(contentType) &&
      /\.docx$/i.test(fileName ?? ""));
  if (isDocx) {
    try {
      const text = await extractDocx(bytes);
      return {
        ...base,
        ...truncate(text),
        note: text ? undefined : "document has no text",
      };
    } catch {
      return { ...base, note: "could not read Word document text" };
    }
  }
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

const BESTANDDATA_ID = /^[A-Za-z0-9._~-]{1,200}$/;

export function isBestanddataId(value: string): boolean {
  return BESTANDDATA_ID.test(value);
}

/**
 * Signed download link for a studiewijzer file that only has a
 * `bestanddataId`, the way the portal's "open attachment" does it:
 * `GET /gcs/download/{bestanddataId}` (with the login token) answers with the
 * link as plain text. The link itself is then fetched without a token.
 */
export async function resolveBestanddataUrl(
  client: ApiClient,
  bestanddataId: string,
): Promise<URL> {
  if (!isBestanddataId(bestanddataId)) {
    throw new AttachmentError("invalid bestanddataId");
  }
  const response = await client.getRaw(
    `/gcs/download/${encodeURIComponent(bestanddataId)}`,
    "text/plain, application/json, */*",
  );
  let text = new TextDecoder("utf-8")
    .decode(await readCapped(response, 64 * 1024))
    .trim();
  if (text.startsWith('"') || text.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === "string") text = parsed;
      else if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const candidate = record.url ?? record.downloadUrl ?? record.href;
        if (typeof candidate === "string") text = candidate;
      }
    } catch {
      // not JSON; use as is
    }
  }
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    throw new AttachmentError("Somtoday did not return a download link");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new AttachmentError("Somtoday returned an unexpected download link");
  }
  return url;
}
