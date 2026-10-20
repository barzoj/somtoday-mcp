import { htmlToPlain } from "../html.js";
import type { ApiClient } from "./client.js";
import { linkId } from "./simplify.js";
import { compact } from "./studiewijzer.js";

export const REGISTRATION_CATEGORIES = [
  "ongeoorloofdAfwezig",
  "geoorloofdAfwezig",
  "afwezigWaarnemingen",
  "teLaat",
  "verwijderd",
  "huiswerkNietGemaakt",
  "materiaalNietInOrde",
] as const;

type RawAfspraak = {
  beginDatumTijd?: string;
  beginLesuur?: number;
  titel?: string;
  vak?: { naam?: string; afkorting?: string };
};

type RawRegistratie = {
  registratieId?: number;
  registratieSoort?: string;
  begin?: string;
  eind?: string;
  omschrijving?: string;
  geoorloofd?: boolean;
  afgehandeld?: boolean;
  afspraak?: RawAfspraak;
  afspraken?: RawAfspraak[];
};

function mapLes(afspraak: RawAfspraak) {
  return compact({
    begin: afspraak.beginDatumTijd,
    lesuur: afspraak.beginLesuur,
    vak: afspraak.vak?.naam,
    titel: afspraak.titel,
  });
}

export async function fetchRegistrations(
  client: ApiClient,
  leerlingId: number,
  periode: "SCHOOLJAAR" | "CIJFERPERIODE",
) {
  const { body } = await client.get<
    Record<string, RawRegistratie[] | undefined>
  >(
    `/leerlingen/${leerlingId}/registratieOverzicht`,
    new URLSearchParams({ periode }),
  );
  const categories: Record<string, unknown[]> = {};
  const aantallen: Record<string, number> = {};
  const keys = new Set<string>([
    ...REGISTRATION_CATEGORIES,
    ...Object.keys(body).filter((key) => Array.isArray(body[key])),
  ]);
  for (const key of keys) {
    const entries = body[key] ?? [];
    aantallen[key] = entries.length;
    categories[key] = entries
      .map((entry) =>
        compact({
          id: entry.registratieId,
          soort: entry.registratieSoort,
          begin: entry.begin,
          eind: entry.eind,
          omschrijving: htmlToPlain(entry.omschrijving) || undefined,
          geoorloofd: entry.geoorloofd,
          afgehandeld: entry.afgehandeld,
          lessen: [
            ...(entry.afspraak ? [entry.afspraak] : []),
            ...(entry.afspraken ?? []),
          ].map(mapLes),
        }),
      )
      .sort((a, b) => (b.begin ?? "").localeCompare(a.begin ?? ""));
  }
  return { periode, aantallen, registraties: categories };
}

type RawMaatregelToekenning = {
  links?: unknown[];
  maatregelDatum?: string;
  opmerkingen?: string;
  nagekomen?: boolean;
  automatischToegekend?: boolean;
  maatregel?: { omschrijving?: string };
  veroorzaaktDoor?: { omschrijving?: string; beginDatumTijd?: string };
};

export async function fetchActiveMeasures(
  client: ApiClient,
  leerlingId: number,
) {
  const { items } = await client.getAll<RawMaatregelToekenning>(
    `/maatregeltoekenningen/actief/${leerlingId}`,
  );
  return items.map((item) =>
    compact({
      id: linkId(item),
      datum: item.maatregelDatum,
      maatregel: item.maatregel?.omschrijving,
      opmerkingen: item.opmerkingen,
      nagekomen: item.nagekomen,
      automatisch: item.automatischToegekend,
      aanleiding: item.veroorzaaktDoor
        ? compact({
            omschrijving: item.veroorzaaktDoor.omschrijving,
            begin: item.veroorzaaktDoor.beginDatumTijd,
          })
        : undefined,
    }),
  );
}
