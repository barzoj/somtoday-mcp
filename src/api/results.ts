import type { ApiClient } from "./client.js";
import { repeatedParams } from "./client.js";
import { linkId } from "./simplify.js";
import { compact } from "./studiewijzer.js";

export type Dossier = "voortgang" | "examen";

export const DOSSIER_PATH: Record<Dossier, string> = {
  voortgang: "/geldendvoortgangsdossierresultaten",
  examen: "/geldendexamendossierresultaten",
};

export const LATEST_TYPES = [
  "Toetskolom",
  "DeeltoetsKolom",
  "Werkstukcijferkolom",
  "Advieskolom",
] as const;

export const LATEST_ADDITIONALS = [
  "vaknaam",
  "resultaatkolom",
  "naamalternatiefniveau",
  "vakuuid",
  "lichtinguuid",
] as const;

export type RawResult = {
  links?: unknown[];
  cijfer?: number;
  formattedResultaat?: string;
  formattedEerstePoging?: string;
  formattedHerkansing1?: string;
  formattedHerkansing2?: string;
  cijferEerstePoging?: number;
  datumInvoerEerstePoging?: string;
  datumInvoerHerkansing1?: string;
  datumInvoer?: string;
  herkansing?: string;
  isCijfer?: boolean;
  isLabel?: boolean;
  isVoldoende?: boolean;
  label?: string;
  labelAfkorting?: string;
  omschrijving?: string;
  opmerkingen?: string;
  opmerkingenEerstePoging?: string;
  bijzonderheid?: string;
  periode?: number;
  toetscode?: string;
  toetssoort?: string;
  type?: string;
  volgnummer?: number;
  weging?: number;
  examenWeging?: number;
  additionalObjects?: {
    vaknaam?: string;
    resultaatkolom?: string | number;
    naamalternatiefniveau?: string;
    naamstandaardniveau?: string;
    heeftalternatiefniveau?: boolean;
    leerjaar?: number;
    periodeAfkorting?: string;
    vakuuid?: string;
    lichtinguuid?: string;
    toetssoortafkorting?: string;
  };
};

export type ResultView = ReturnType<typeof mapResult>;

/** Every field the portal shows for one result column value. */
export function mapResult(raw: RawResult) {
  const extra = raw.additionalObjects ?? {};
  const herkansing =
    raw.herkansing && raw.herkansing !== "Geen"
      ? compact({
          soort: raw.herkansing,
          eerstePoging: raw.formattedEerstePoging,
          herkansing1: raw.formattedHerkansing1,
          herkansing2: raw.formattedHerkansing2,
          datumHerkansing1: raw.datumInvoerHerkansing1,
          opmerkingenEerstePoging: raw.opmerkingenEerstePoging,
        })
      : undefined;
  return compact({
    id: linkId(raw),
    vak: extra.vaknaam,
    vakUuid: extra.vakuuid,
    lichtingUuid: extra.lichtinguuid,
    kolom:
      extra.resultaatkolom === undefined
        ? undefined
        : String(extra.resultaatkolom),
    omschrijving: raw.omschrijving,
    resultaat: raw.formattedResultaat ?? raw.label,
    cijfer: raw.cijfer,
    label: raw.label,
    voldoende: raw.isVoldoende,
    weging: raw.weging,
    examenWeging: raw.examenWeging,
    type: raw.type,
    toetssoort: raw.toetssoort ?? extra.toetssoortafkorting,
    toetscode: raw.toetscode,
    periode: raw.periode,
    periodeAfkorting: extra.periodeAfkorting,
    leerjaar: extra.leerjaar,
    niveau: extra.naamalternatiefniveau ?? extra.naamstandaardniveau,
    datum: raw.datumInvoerEerstePoging ?? raw.datumInvoer,
    opmerkingen: raw.opmerkingen,
    bijzonderheid: raw.bijzonderheid,
    herkansing,
    volgnummer: raw.volgnummer,
  });
}

export async function fetchLatestResults(
  client: ApiClient,
  leerlingId: number,
  dossier: Dossier,
  limit: number,
): Promise<{ total?: number; items: ResultView[] }> {
  const query = new URLSearchParams();
  repeatedParams("type", LATEST_TYPES, query);
  repeatedParams("additional", LATEST_ADDITIONALS, query);
  query.set("sort", "desc-geldendResultaatCijferInvoer");
  const { items, total } = await client.getAll<RawResult>(
    `${DOSSIER_PATH[dossier]}/leerling/${leerlingId}`,
    query,
    { maxItems: limit },
  );
  return { total, items: items.map(mapResult) };
}

export async function fetchNextPublication(
  client: ApiClient,
  leerlingId: number,
): Promise<unknown> {
  const { body } = await client.get<{ value?: unknown }>(
    `/resultaatpublicatiemomenten/volgende/leerling/${leerlingId}`,
  );
  return body.value ?? null;
}
