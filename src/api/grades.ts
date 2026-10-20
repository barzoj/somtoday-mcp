import {
  GRADE_ADDITIONALS,
  GRADE_CAP,
  GRADE_SORT,
  GRADE_TYPES,
} from "../constants.js";
import {
  parseContentRangeTotal,
  repeatedParams,
  type ApiClient,
} from "./client.js";
import type {
  GeldendResultaat,
  ItemList,
  Plaatsing,
  Vakgemiddelde,
} from "./types.js";

export type GradeView = {
  vaknaam?: string;
  cijfer?: number;
  formattedResultaat?: string;
  weging?: number;
  toetssoort?: string;
  toetscode?: string;
  datumInvoerEerstePoging?: string;
  herkansing?: string;
  type?: string;
};

export type AverageView = {
  afkorting?: string;
  formattedResultaat?: string;
};

export function mapGrade(item: GeldendResultaat): GradeView {
  return {
    vaknaam: item.additionalObjects?.vaknaam,
    cijfer: item.cijfer,
    formattedResultaat: item.formattedResultaat,
    weging: item.weging,
    toetssoort: item.toetssoort,
    toetscode: item.toetscode,
    datumInvoerEerstePoging: item.datumInvoerEerstePoging,
    herkansing: item.herkansing,
    type: item.type,
  };
}

export function mapAverages(payload: {
  gemiddelden?: Vakgemiddelde[];
  items?: Vakgemiddelde[];
}): AverageView[] {
  const rows = payload.gemiddelden ?? [];
  return rows.map((row) => ({
    afkorting: row.vakkeuze?.vak?.afkorting,
    formattedResultaat: row.voortgangsdossierResultaat?.formattedResultaat,
  }));
}

export function gradesQuery(): URLSearchParams {
  const query = new URLSearchParams();
  repeatedParams("type", GRADE_TYPES, query);
  repeatedParams("additional", GRADE_ADDITIONALS, query);
  query.set("sort", GRADE_SORT);
  return query;
}

export async function fetchGrades(
  client: ApiClient,
  leerlingId: number,
): Promise<{ items: GradeView[]; total?: number; shown: number }> {
  const { body, contentRange } = await client.get<ItemList<GeldendResultaat>>(
    `/geldendvoortgangsdossierresultaten/leerling/${leerlingId}`,
    gradesQuery(),
  );
  const all = (body.items ?? []).map(mapGrade);
  return {
    items: all.slice(0, GRADE_CAP),
    shown: Math.min(all.length, GRADE_CAP),
    total: parseContentRangeTotal(contentRange) ?? all.length,
  };
}

export async function fetchAverages(
  client: ApiClient,
  leerlingId: number,
): Promise<AverageView[]> {
  const { body } = await client.get<ItemList<Plaatsing>>(
    "/plaatsingen",
    new URLSearchParams({
      leerling: String(leerlingId),
    }),
  );
  const current = (body.items ?? []).find((item) => item.huidig === true);
  if (!current?.UUID) {
    return [];
  }
  const averages = await client.get<{ gemiddelden?: Vakgemiddelde[] }>(
    `/vakkeuzes/plaatsing/${current.UUID}/vakgemiddelden`,
  );
  return mapAverages(averages.body);
}
