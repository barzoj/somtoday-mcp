import { htmlToPlain } from "../html.js";
import { repeatedParams, type ApiClient } from "./client.js";
import { linkId } from "./simplify.js";
import {
  compact,
  mapAttachment,
  type AttachmentView,
  type RawBijlage,
} from "./studiewijzer.js";

export const CONVERSATION_ADDITIONALS = [
  "verzondenDoorGebruiker",
  "verzenderCorrespondent",
  "ontvangerCorrespondenten",
  "aantalExtraOntvangers",
  "actiefVoorGebruiker",
] as const;

type RawCorrespondent = {
  naam?: string;
  initialen?: string;
  vakken?: Array<{ naam?: string; afkorting?: string }>;
};

type RawBoodschap = {
  links?: unknown[];
  verzendDatum?: string;
  wijzigingsDatum?: string;
  onderwerp?: string;
  inhoud?: string;
  mimeType?: string;
  prioriteit?: string;
  notificatieType?: string;
  draft?: boolean;
  bijlages?: RawBijlage[];
  additionalObjects?: {
    verzondenDoorGebruiker?: boolean;
    verzenderCorrespondent?: RawCorrespondent;
    ontvangerCorrespondenten?: { items?: RawCorrespondent[] };
    aantalExtraOntvangers?: number;
    isOuderavondUitnodiging?: boolean;
  };
};

export type RawConversatie = {
  boodschappen?: RawBoodschap[];
  datumOudsteOngelezenBoodschap?: string;
};

const AUTOMATIC = "Automatisch bericht";

function correspondent(raw?: RawCorrespondent): string {
  return raw?.naam ?? AUTOMATIC;
}

/** The portal uses the oldest message's id as the conversation id. */
export function conversationId(
  conversatie: RawConversatie,
): number | undefined {
  return linkId(conversatie.boodschappen?.at(-1));
}

export function summarizeConversation(conversatie: RawConversatie) {
  const berichten = conversatie.boodschappen ?? [];
  const newest = berichten[0];
  return compact({
    id: conversationId(conversatie),
    onderwerp: berichten.at(-1)?.onderwerp ?? newest?.onderwerp,
    laatsteBericht: newest?.verzendDatum,
    van: newest
      ? correspondent(newest.additionalObjects?.verzenderCorrespondent)
      : undefined,
    doorJou: newest?.additionalObjects?.verzondenDoorGebruiker,
    aantalBerichten: berichten.length,
    ongelezen: Boolean(conversatie.datumOudsteOngelezenBoodschap),
    aantalBijlagen:
      berichten.reduce((sum, b) => sum + (b.bijlages?.length ?? 0), 0) ||
      undefined,
    ouderavondUitnodiging:
      berichten.some((b) => b.additionalObjects?.isOuderavondUitnodiging) ||
      undefined,
    voorbeeld: htmlToPlain(newest?.inhoud).slice(0, 160) || undefined,
  });
}

export function mapMessage(boodschap: RawBoodschap) {
  const extra = boodschap.additionalObjects ?? {};
  const isHtml = !boodschap.mimeType || boodschap.mimeType.includes("html");
  return compact({
    id: linkId(boodschap),
    verzendDatum: boodschap.verzendDatum,
    onderwerp: boodschap.onderwerp,
    van: correspondent(extra.verzenderCorrespondent),
    doorJou: extra.verzondenDoorGebruiker,
    aan: (extra.ontvangerCorrespondenten?.items ?? []).map(
      (item) => item.naam ?? "?",
    ),
    aantalExtraOntvangers: extra.aantalExtraOntvangers || undefined,
    inhoud:
      (isHtml ? htmlToPlain(boodschap.inhoud) : boodschap.inhoud) || undefined,
    prioriteit: boodschap.prioriteit,
    bijlagen: (boodschap.bijlages ?? [])
      .map(mapAttachment)
      .filter((value): value is AttachmentView => Boolean(value)),
    ouderavondUitnodiging: extra.isOuderavondUitnodiging || undefined,
  });
}

export async function fetchConversations(
  client: ApiClient,
  options: { alle: boolean; maxItems?: number },
): Promise<{ total?: number; items: RawConversatie[] }> {
  const query = repeatedParams("additional", CONVERSATION_ADDITIONALS);
  query.set("alle", String(options.alle));
  return client.getAll<RawConversatie>("/boodschappen/conversaties", query, {
    maxItems: options.maxItems,
  });
}

export async function fetchUnreadCount(
  client: ApiClient,
): Promise<number | undefined> {
  const { body } = await client.get<{ values?: number[] }>(
    "/boodschappen/conversaties/ongelezencount",
  );
  return body.values?.[0];
}

export async function fetchExtraRecipients(
  client: ApiClient,
  boodschapId: number,
): Promise<string[]> {
  const { items } = await client.getAll<RawCorrespondent>(
    `/boodschappen/conversatie/${boodschapId}/extraOntvangers`,
  );
  return items.map((item) => item.naam ?? "?");
}
