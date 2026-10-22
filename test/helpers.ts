import { MemorySecretStore } from "../src/auth/memory-store.js";
import { SessionManager } from "../src/auth/session.js";
import type { StoredSession } from "../src/auth/store.js";
import { createToolContext, type ToolContext } from "../src/tools/context.js";

export const FAKE_SESSION: StoredSession = {
  refreshToken: "refresh-fixture-not-real",
  clientId: "somtoday-leerling-native",
  tenantUuid: "00000000-0000-4000-8000-000000000001",
  apiBaseUrl: "https://api.example.test",
  schoolLabel: "Fixture College",
};

export const FAKE_JWT =
  "eyJhbGciOiJub25lIn0.eyJzdWIiOiJmaXh0dXJlLWFjY291bnQifQ.sig";

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function scriptedFetch(
  handlers: Array<
    (url: string, init?: RequestInit) => Response | Promise<Response>
  >,
): {
  fetchFn: typeof fetch;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let index = 0;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const handler = handlers[index];
    index += 1;
    if (!handler) {
      throw new Error(`Unexpected fetch ${url}`);
    }
    return handler(url, init);
  };
  return { fetchFn, calls };
}

export async function sessionWithStore(
  fetchFn: typeof fetch,
  stored: StoredSession | null = FAKE_SESSION,
  clock = () => 1_000_000,
): Promise<SessionManager> {
  const store = new MemorySecretStore();
  if (stored) {
    await store.save(stored);
  }
  return new SessionManager(store, fetchFn, clock);
}

export async function toolContext(
  fetchFn: typeof fetch,
  stored: StoredSession | null = FAKE_SESSION,
): Promise<ToolContext> {
  const session = await sessionWithStore(fetchFn, stored);
  if (stored) {
    session.seedAccessToken(
      "access-fixture-not-jwt-plain",
      Date.now() + 3_600_000,
    );
  }
  return createToolContext(session, fetchFn);
}

export function formBody(init?: RequestInit): URLSearchParams {
  return new URLSearchParams(String(init?.body ?? ""));
}

export function oneRestrictie(id = 4242, flags = true) {
  return {
    additionalObjects: {
      restricties: {
        items: [
          {
            leerlingId: id,
            huiswerkBekijkenAan: flags,
            roosterBekijkenAan: flags,
            cijfersBekijkenAan: flags,
          },
        ],
      },
    },
  };
}

export type Route = [
  RegExp,
  (url: URL, init?: RequestInit) => Response | Promise<Response>,
];

/**
 * Fake fetch that answers by URL pattern (order independent). Unmatched URLs
 * fail the test. Records every call, including headers.
 */
export function routedFetch(routes: Route[]): {
  fetchFn: typeof fetch;
  calls: Array<{ url: URL; init?: RequestInit; headers: Headers }>;
} {
  const calls: Array<{ url: URL; init?: RequestInit; headers: Headers }> = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init, headers: new Headers(init?.headers) });
    const route = routes.find(([pattern]) =>
      pattern.test(url.pathname + url.search),
    );
    if (!route) {
      throw new Error(`Unexpected fetch ${url.pathname}${url.search}`);
    }
    return route[1](url, init);
  };
  return { fetchFn, calls };
}

/** `{items}` list answer with a Content-Range like the API sends. */
export function listResponse(items: unknown[], total = items.length): Response {
  const end = Math.max(items.length - 1, 0);
  return jsonResponse(
    206,
    { items },
    {
      "content-range": `items 0-${end}/${total}`,
    },
  );
}

/** account/me answer for one child with every section switched on. */
export function accountMe(id = 4242, rights: Record<string, boolean> = {}) {
  return jsonResponse(200, {
    additionalObjects: {
      restricties: {
        items: [
          {
            leerlingId: id,
            vestigingsId: 77,
            huiswerkBekijkenAan: true,
            roosterBekijkenAan: true,
            cijfersBekijkenAan: true,
            ...rights,
          },
        ],
      },
    },
  });
}

/** Parse the JSON body of a successful tool result. */
export function toolJson(result: {
  content: Array<{ text: string }>;
  isError?: boolean;
}): Record<string, unknown> {
  if (result.isError) {
    throw new Error(`tool error: ${result.content[0]?.text}`);
  }
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

/** A one-page PDF with a real text layer (for extraction tests). */
export function minimalPdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
