import { ACCEPT, ACCEPT_JSON, API_PREFIX } from "../constants.js";
import { LoginRequiredError } from "../errors.js";
import type { SessionManager } from "../auth/session.js";
import type { FetchFn } from "../auth/tokens.js";

export type ApiResponse<T> = {
  status: number;
  body: T;
  contentRange?: string;
};

export type GetOptions = {
  /** `json` for the endpoints that expect plain application/json (news, school info, signing). */
  accept?: "platinum" | "json";
  /** Inclusive item range, sent as `Range: items=start-end`. */
  range?: { start: number; end: number };
};

export type AllOptions = {
  accept?: "platinum" | "json";
  /** Items per request (the server allows at most 100). */
  pageSize?: number;
  /** Stop after this many items. */
  maxItems?: number;
  /** Sees every page body (for top-level fields next to `items`). */
  onPage?: (body: unknown) => void;
};

export const PAGE_SIZE = 100;
export const MAX_PAGES = 100;

/**
 * The API answered with a real "no": a 403 with a body (for example no
 * study planner yet, or a section the school switched off) or a 404.
 * Tools report this as `available: false` instead of an error.
 */
export class ApiNotAvailableError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`Not available (HTTP ${status})`);
    this.name = "ApiNotAvailableError";
  }
}

export class ApiClient {
  constructor(
    private readonly session: SessionManager,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async get<T>(
    path: string,
    query?: URLSearchParams,
    options: GetOptions = {},
  ): Promise<ApiResponse<T>> {
    const url = await this.url(path, query);
    const first = await this.send(url, options);
    if (!(await shouldRetryWithNewToken(first.response))) {
      return this.read(first.response, path);
    }

    // 401, or a 403 without a body: renew the access token (once) and retry once.
    await this.session.refreshAfterRejection(first.token);
    const retry = await this.send(url, options);
    if (retry.response.status === 401) {
      this.session.clearAccessToken();
      throw new LoginRequiredError("API rejected a freshly renewed token");
    }
    return this.read(retry.response, path);
  }

  /**
   * Fetch every item of a list endpoint the way the portal does: request
   * `Range: items=a-b` in pages of at most 100 and continue while
   * `Content-Range: items a-b/total` says there is more. A response without
   * Content-Range is complete. Accepts `{items: [...]}` and top-level arrays.
   */
  async getAll<T>(
    path: string,
    query?: URLSearchParams,
    options: AllOptions = {},
  ): Promise<{ items: T[]; total?: number }> {
    const pageSize = Math.min(
      Math.max(options.pageSize ?? PAGE_SIZE, 1),
      PAGE_SIZE,
    );
    const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
    const items: T[] = [];
    let total: number | undefined;
    let start = 0;
    for (let page = 0; page < MAX_PAGES && items.length < maxItems; page += 1) {
      const end = start + Math.min(pageSize, maxItems - items.length) - 1;
      const response = await this.get<unknown>(path, query, {
        accept: options.accept,
        range: { start, end },
      });
      options.onPage?.(response.body);
      const pageItems = listItems<T>(response.body);
      items.push(...pageItems);
      const range = parseContentRange(response.contentRange);
      if (!range) {
        break;
      }
      total = range.total ?? total;
      const next = range.end + 1;
      if (pageItems.length === 0 || next <= start) {
        break;
      }
      if (total !== undefined && next >= total) {
        break;
      }
      start = next;
    }
    return {
      items: items.slice(0, maxItems),
      total: total ?? (items.length < maxItems ? items.length : undefined),
    };
  }

  private async url(path: string, query?: URLSearchParams): Promise<string> {
    const base = (await this.session.getApiBaseUrl()).replace(/\/$/, "");
    const suffix = path.startsWith("/") ? path : `/${path}`;
    const target = new URL(`${base}${API_PREFIX}${suffix}`);
    if (query) {
      for (const [key, value] of query.entries()) {
        target.searchParams.append(key, value);
      }
    }
    return target.toString();
  }

  private async send(
    url: string,
    options: GetOptions,
  ): Promise<{ response: Response; token: string }> {
    const token = await this.session.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: options.accept === "json" ? ACCEPT_JSON : ACCEPT,
    };
    if (options.range) {
      headers.Range = `items=${options.range.start}-${options.range.end}`;
    }
    // Read-only by design: this client only ever sends GET.
    const response = await this.fetchFn(url, { method: "GET", headers });
    return { response, token };
  }

  private async read<T>(
    response: Response,
    path: string,
  ): Promise<ApiResponse<T>> {
    if (response.status === 403 || response.status === 404) {
      throw new ApiNotAvailableError(response.status, path);
    }
    if (
      response.status !== 200 &&
      response.status !== 204 &&
      response.status !== 206
    ) {
      throw new Error(`API HTTP ${response.status}`);
    }
    // 204 No Content (e.g. no message recipients) or an empty body is an empty result.
    const text = response.status === 204 ? "" : await response.text();
    const body = (text.trim() === "" ? { items: [] } : JSON.parse(text)) as T;
    return {
      status: response.status,
      body,
      contentRange: response.headers.get("content-range") ?? undefined,
    };
  }
}

async function shouldRetryWithNewToken(response: Response): Promise<boolean> {
  if (response.status === 401) {
    return true;
  }
  if (response.status !== 403) {
    return false;
  }
  // A 403 with a body is a real permission answer (e.g. no studiewijzer yet).
  const body = await response
    .clone()
    .text()
    .catch(() => "");
  return body.trim() === "";
}

export function listItems<T>(body: unknown): T[] {
  if (Array.isArray(body)) {
    return body as T[];
  }
  const items = (body as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

export function parseContentRange(
  header?: string,
): { start: number; end: number; total?: number } | undefined {
  if (!header) {
    return undefined;
  }
  const match = /items\s+(\d+)-(\d+)\/(\d+|\*)/i.exec(header);
  if (!match) {
    return undefined;
  }
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: match[3] === "*" ? undefined : Number(match[3]),
  };
}

export function parseContentRangeTotal(header?: string): number | undefined {
  if (!header) {
    return undefined;
  }
  const match = /items\s+\d+-\d+\/(\d+|\*)/i.exec(header);
  if (!match || match[1] === "*") {
    return undefined;
  }
  return Number(match[1]);
}

export function repeatedParams(
  key: string,
  values: readonly string[],
  into = new URLSearchParams(),
): URLSearchParams {
  for (const value of values) {
    into.append(key, value);
  }
  return into;
}
