import type { ApiClient } from "./client.js";
import { readFile, type Attachment } from "./download.js";
import { fetchConversations } from "./messages.js";
import { simplify } from "./simplify.js";

/** Statuses where the portal shows no document (still to sign, withdrawn, expired). */
const NO_DOCUMENT_STATUSES = new Set(["OPENSTAAND", "INGETROKKEN", "VERLOPEN"]);

/**
 * How to fetch the document behind a signing request. The portal downloads it
 * from `begeleiden/ondertekenverzoeken/{id}/document` (PDF, needs the login
 * token), so it is not a public fileUrl: use the `signing_document` tool.
 */
export function signingDocumentRef(
  item: unknown,
):
  | { tool: "signing_document"; id: string | number; available: boolean }
  | undefined {
  const source = item as { id?: unknown; status?: unknown } | null;
  const id = source?.id;
  if (typeof id !== "string" && typeof id !== "number") return undefined;
  const status = typeof source?.status === "string" ? source.status : "";
  return {
    tool: "signing_document",
    id,
    available: !NO_DOCUMENT_STATUSES.has(status.toUpperCase()),
  };
}

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
  return items.map((item) => {
    const out = (simplify(item) ?? {}) as Record<string, unknown>;
    const document = signingDocumentRef(out);
    return document ? { ...out, document } : out;
  });
}

/**
 * The (signed) document of one signing request, as the portal's
 * "download document" button fetches it. Read-only GET with the login token.
 */
export async function fetchSigningDocument(
  client: ApiClient,
  id: string,
): Promise<Attachment> {
  const path = `/begeleiden/ondertekenverzoeken/${encodeURIComponent(id)}/document`;
  const response = await client.getRaw(path, "application/pdf");
  return readFile(
    response,
    new URL(response.url || `https://api.somtoday.nl${path}`),
    undefined,
    `ondertekenverzoek-${id}.pdf`,
  );
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
