import { ACCEPT, API_PREFIX } from "../constants.js";
import { LoginRequiredError } from "../errors.js";
import type { SessionManager } from "../auth/session.js";
import type { FetchFn } from "../auth/tokens.js";

export type ApiResponse<T> = {
  status: number;
  body: T;
  contentRange?: string;
};

export class ApiClient {
  constructor(
    private readonly session: SessionManager,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async get<T>(path: string, query?: URLSearchParams): Promise<ApiResponse<T>> {
    const url = await this.url(path, query);
    const first = await this.send(url);
    if (!(await shouldRetryWithNewToken(first.response))) {
      return this.read(first.response);
    }

    // 401, or a 403 without a body: renew the access token (once) and retry once.
    await this.session.refreshAfterRejection(first.token);
    const retry = await this.send(url);
    if (retry.response.status === 401) {
      this.session.clearAccessToken();
      throw new LoginRequiredError("API rejected a freshly renewed token");
    }
    return this.read(retry.response);
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
  ): Promise<{ response: Response; token: string }> {
    const token = await this.session.getAccessToken();
    const response = await this.fetchFn(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: ACCEPT,
      },
    });
    return { response, token };
  }

  private async read<T>(response: Response): Promise<ApiResponse<T>> {
    if (response.status !== 200 && response.status !== 206) {
      throw new Error(`API HTTP ${response.status}`);
    }
    const body = (await response.json()) as T;
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
