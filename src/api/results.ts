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

type RawPlaatsing = {
  UUID?: string;
  huidig?: boolean;
  leerjaar?: number;
  opleidingsnaam?: string;
  stamgroepnaam?: string;
  vanafDatum?: string;
  totDatum?: string;
  schooljaar?: { naam?: string; isHuidig?: boolean };
  vestiging?: { naam?: string };
};

export type PlaatsingView = {
  uuid: string;
  schooljaar?: string;
  huidig?: boolean;
  leerjaar?: number;
  opleiding?: string;
  stamgroep?: string;
  vestiging?: string;
  van?: string;
  tot?: string;
};

export async function fetchPlaatsingen(
  client: ApiClient,
  leerlingId: number,
): Promise<PlaatsingView[]> {
  const { items } = await client.getAll<RawPlaatsing>(
    "/plaatsingen",
    new URLSearchParams({ leerling: String(leerlingId) }),
  );
  return items
    .filter((item): item is RawPlaatsing & { UUID: string } =>
      Boolean(item.UUID),
    )
    .map((item) =>
      compact({
        uuid: item.UUID,
        schooljaar: item.schooljaar?.naam,
        huidig: item.huidig,
        leerjaar: item.leerjaar,
        opleiding: item.opleidingsnaam,
        stamgroep: item.stamgroepnaam,
        vestiging: item.vestiging?.naam,
        van: item.vanafDatum,
        tot: item.totDatum,
      }),
    )
    .sort((a, b) => (b.van ?? "").localeCompare(a.van ?? ""));
}

/** Current placement, or the one for a school year like "2025/2026". */
export function pickPlaatsing(
  plaatsingen: PlaatsingView[],
  schooljaar?: string,
): PlaatsingView {
  const chosen = schooljaar
    ? plaatsingen.find(
        (item) => item.schooljaar === schooljaar || item.uuid === schooljaar,
      )
    : (plaatsingen.find((item) => item.huidig) ?? plaatsingen[0]);
  if (!chosen) {
    const years = plaatsingen.map((item) => item.schooljaar).join(", ");
    throw new Error(
      schooljaar
        ? `No placement for "${schooljaar}". Known school years: ${years || "none"}`
        : "No placements found for this child",
    );
  }
  return chosen;
}

type RawVakVoortgang = {
  vakkeuze?: {
    vak?: { UUID?: string; naam?: string; afkorting?: string };
    lichting?: { UUID?: string; naam?: string };
    relevanteCijferLichting?: { UUID?: string };
    vrijstelling?: boolean;
  };
  standaardNormering?: string;
  alternatieveNormering?: string;
  perioden?: Array<{
    periode?: number;
    rapportCijfer?: RawResult;
    resultaten?: RawResult[];
  }>;
};

export async function fetchGradeOverview(
  client: ApiClient,
  leerlingId: number,
  plaatsingUuid: string,
) {
  const { body } = await client.get<{
    cijferperioden?: Array<{
      periode?: number;
      datumVan?: string;
      datumTot?: string;
    }>;
    vakResultaten?: RawVakVoortgang[];
  }>(
    `/geldendvoortgangsdossierresultaten/leerling/cijferoverzicht/${leerlingId}`,
    new URLSearchParams({ plaatsing: plaatsingUuid }),
  );
  return {
    perioden: (body.cijferperioden ?? []).map((periode) =>
      compact({
        periode: periode.periode,
        van: periode.datumVan,
        tot: periode.datumTot,
      }),
    ),
    vakken: (body.vakResultaten ?? [])
      .map((vak) =>
        compact({
          vak: vak.vakkeuze?.vak?.naam,
          afkorting: vak.vakkeuze?.vak?.afkorting,
          vakUuid: vak.vakkeuze?.vak?.UUID,
          lichtingUuid:
            vak.vakkeuze?.relevanteCijferLichting?.UUID ??
            vak.vakkeuze?.lichting?.UUID,
          vrijstelling: vak.vakkeuze?.vrijstelling || undefined,
          normering: vak.alternatieveNormering ?? vak.standaardNormering,
          perioden: (vak.perioden ?? []).map((periode) =>
            compact({
              periode: periode.periode,
              rapportCijfer: periode.rapportCijfer
                ? mapResult(periode.rapportCijfer)
                : undefined,
              resultaten: (periode.resultaten ?? []).map(mapResult),
            }),
          ),
        }),
      )
      .sort((a, b) => (a.vak ?? "").localeCompare(b.vak ?? "")),
  };
}

export const SUBJECT_TYPES = [
  "Toetskolom",
  "SamengesteldeToetsKolom",
  "Werkstukcijferkolom",
  "Advieskolom",
  "PeriodeGemiddeldeKolom",
  "RapportGemiddeldeKolom",
  "RapportCijferKolom",
  "RapportToetskolom",
  "SEGemiddeldeKolom",
  "ToetssoortGemiddeldeKolom",
] as const;

const SUBJECT_ADDITIONALS = [
  "vaknaam",
  "resultaatkolom",
  "heeftalternatiefniveau",
  "naamalternatiefniveau",
  "naamstandaardniveau",
  "leerjaar",
] as const;

export type VakkeuzeView = {
  vak?: string;
  afkorting?: string;
  vakUuid: string;
  lichtingUuid?: string;
  vrijstelling?: boolean;
};

type RawVakkeuze = {
  vak?: { UUID?: string; naam?: string; afkorting?: string };
  lichting?: { UUID?: string };
  relevanteCijferLichting?: { UUID?: string };
  vrijstelling?: boolean;
};

export async function fetchVakkeuzes(
  client: ApiClient,
  leerlingId: number,
  peildatum: string,
): Promise<VakkeuzeView[]> {
  const { items } = await client.getAll<RawVakkeuze>(
    "/vakkeuzes",
    new URLSearchParams({
      leerling: String(leerlingId),
      actiefOpPeildatum: peildatum,
    }),
  );
  return items
    .filter((item) => item.vak?.UUID)
    .map((item) =>
      compact({
        vak: item.vak?.naam,
        afkorting: item.vak?.afkorting,
        vakUuid: item.vak!.UUID!,
        lichtingUuid: item.relevanteCijferLichting?.UUID ?? item.lichting?.UUID,
        vrijstelling: item.vrijstelling || undefined,
      }),
    )
    .sort((a, b) => (a.vak ?? "").localeCompare(b.vak ?? ""));
}

export function findVakkeuze(
  vakken: VakkeuzeView[],
  query: string,
): VakkeuzeView {
  const needle = query.trim().toLowerCase();
  const exact = vakken.find(
    (vak) =>
      vak.vakUuid.toLowerCase() === needle ||
      vak.afkorting?.toLowerCase() === needle ||
      vak.vak?.toLowerCase() === needle,
  );
  if (exact) return exact;
  const partial = vakken.filter((vak) =>
    vak.vak?.toLowerCase().includes(needle),
  );
  if (partial.length === 1) return partial[0]!;
  throw new Error(
    partial.length > 1
      ? `Several subjects match "${query}": ${partial.map((vak) => vak.vak).join(", ")}`
      : `No subject matches "${query}". Subjects: ${vakken.map((vak) => `${vak.vak} (${vak.afkorting})`).join(", ") || "none"}`,
  );
}

export function subjectQuery(dossier: Dossier): URLSearchParams {
  const query = new URLSearchParams();
  repeatedParams(
    "additional",
    dossier === "voortgang"
      ? [...SUBJECT_ADDITIONALS, "periodeAfkorting"]
      : SUBJECT_ADDITIONALS,
    query,
  );
  repeatedParams("type", SUBJECT_TYPES, query);
  query.set("sort", "desc-geldendResultaatCijferInvoer");
  return query;
}

export async function fetchSubjectResults(
  client: ApiClient,
  leerlingId: number,
  vak: VakkeuzeView,
  dossier: Dossier,
): Promise<ResultView[]> {
  if (!vak.lichtingUuid) {
    throw new Error(`No lichting known for ${vak.vak ?? vak.vakUuid}`);
  }
  const { items } = await client.getAll<RawResult>(
    `${DOSSIER_PATH[dossier]}/vakresultaten/${leerlingId}/vak/${vak.vakUuid}/lichting/${vak.lichtingUuid}`,
    subjectQuery(dossier),
  );
  return items.map(mapResult);
}

/** Column definitions, including columns without a result yet. Shape not fixture-verified, so simplified generically. */
export async function fetchSubjectColumns(
  client: ApiClient,
  leerlingId: number,
  vak: VakkeuzeView,
  dossier: Dossier,
): Promise<unknown[]> {
  const { items } = await client.getAll<unknown>(
    `${DOSSIER_PATH[dossier]}/resultaatkolommen/${leerlingId}/vak/${vak.vakUuid}/lichting/${vak.lichtingUuid}`,
    subjectQuery(dossier),
  );
  return items;
}

export async function fetchDeeltoetsen(
  client: ApiClient,
  leerlingId: number,
  samengesteldeToetsId: string,
  dossier: Dossier,
): Promise<ResultView[]> {
  const { items } = await client.getAll<RawResult>(
    `${DOSSIER_PATH[dossier]}/leerling/${leerlingId}/deeltoetsen/${samengesteldeToetsId}`,
  );
  return items.map(mapResult);
}
