import { htmlToPlain } from "../html.js";
import type { ApiClient } from "./client.js";
import { simplify } from "./simplify.js";
import { compact } from "./studiewijzer.js";

export const NEWS_PAGE = 25;

/**
 * School news (`communicatie/nieuwsberichten`, plain JSON, query paging with
 * amount/start like the portal). The item shape is not fixture-verified yet,
 * so items are simplified generically (HTML fields become text).
 */
export async function fetchNews(
  client: ApiClient,
  limit: number,
): Promise<unknown[]> {
  const items: unknown[] = [];
  for (
    let start = 0;
    items.length < limit && start < 2000;
    start += NEWS_PAGE
  ) {
    const { body } = await client.get<{ nieuwsberichten?: unknown[] }>(
      "/communicatie/nieuwsberichten/ontvangen",
      new URLSearchParams({ amount: String(NEWS_PAGE), start: String(start) }),
      { accept: "json" },
    );
    const page = Array.isArray(body)
      ? (body as unknown[])
      : (body.nieuwsberichten ?? []);
    items.push(...page);
    if (page.length < NEWS_PAGE) break;
  }
  return items.slice(0, limit).map((item) => simplify(item) ?? {});
}

export async function fetchUnreadNews(client: ApiClient): Promise<unknown> {
  const { body } = await client.get<unknown>(
    "/communicatie/nieuwsberichten/ontvangen/aantalongelezen",
    undefined,
    { accept: "json" },
  );
  if (typeof body === "number") return body;
  if (Array.isArray(body) && body.length === 1 && typeof body[0] === "number")
    return body[0];
  return simplify(body) ?? 0;
}

type RawMededeling = {
  id?: number;
  onderwerp?: string;
  inhoud?: string;
  startPublicatie?: string;
  eindPublicatie?: string;
  notificatieNiveau?: string;
  notificatieType?: string;
};

/** Somtoday-wide announcements (landelijke mededelingen). */
export async function fetchAnnouncements(client: ApiClient) {
  const { items } = await client.getAll<RawMededeling>("/mededelingen");
  return items.map((item) =>
    compact({
      id: item.id,
      onderwerp: item.onderwerp,
      inhoud: htmlToPlain(item.inhoud) || undefined,
      van: item.startPublicatie,
      tot: item.eindPublicatie,
      niveau: item.notificatieNiveau,
      type: item.notificatieType,
    }),
  );
}
