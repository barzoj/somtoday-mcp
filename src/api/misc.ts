import type { ApiClient } from "./client.js";
import { fetchConversations } from "./messages.js";
import { simplify } from "./simplify.js";

/** Digital signing requests (`begeleiden/ondertekenverzoeken`, plain JSON). Read-only: signing is never done here. */
export async function fetchSigningRequests(
  client: ApiClient,
): Promise<unknown[]> {
  const { body } = await client.get<unknown>(
    "/begeleiden/ondertekenverzoeken",
    undefined,
    {
      accept: "json",
    },
  );
  const items = Array.isArray(body)
    ? body
    : ((body as { items?: unknown[] })?.items ?? []);
  return items.map((item) => simplify(item) ?? {});
}

/** Consents (photo use etc.) as shown under Voorkeuren → Toestemmingen. Read-only. */
export async function fetchConsents(client: ApiClient): Promise<unknown[]> {
  const { items } = await client.getAll<unknown>("/leerlingen/toestemmingen");
  return items.map((item) => simplify(item) ?? {});
}

export async function fetchParentEvening(
  client: ApiClient,
  id: string,
): Promise<unknown> {
  const { body } = await client.get<unknown>(
    `/ouderavond/${encodeURIComponent(id)}`,
  );
  return simplify(body) ?? {};
}

const OUDERAVOND_LINK = /ouderavond\/([A-Za-z0-9-]+)/g;

/** Parent-evening ids linked from invitation messages (the portal opens `ouderavond/:id`). */
export async function findParentEveningIds(
  client: ApiClient,
): Promise<string[]> {
  const { items } = await fetchConversations(client, {
    alle: true,
    maxItems: 500,
  });
  const ids = new Set<string>();
  for (const conversatie of items) {
    for (const boodschap of conversatie.boodschappen ?? []) {
      const extra = (
        boodschap as {
          additionalObjects?: { isOuderavondUitnodiging?: boolean };
        }
      ).additionalObjects;
      const html = (boodschap as { inhoud?: string }).inhoud ?? "";
      if (!extra?.isOuderavondUitnodiging && !html.includes("ouderavond/"))
        continue;
      for (const match of html.matchAll(OUDERAVOND_LINK)) {
        ids.add(match[1]!);
      }
    }
  }
  return [...ids];
}
