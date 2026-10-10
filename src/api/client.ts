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
    if (first.status !== 401) {
      return this.read(first);
    }

    this.session.clearAccessToken();
    await this.session.refresh();
    const retry = await this.send(url);
    if (retry.status === 401) {
      this.session.clearAccessToken();
      throw new LoginRequiredError();
    }
    return this.read(retry);
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

  private async send(url: string): Promise<Response> {
    const token = await this.session.getAccessToken();
    return this.fetchFn(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: ACCEPT,
      },
    });
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
