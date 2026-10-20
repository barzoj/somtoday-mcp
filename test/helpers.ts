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
