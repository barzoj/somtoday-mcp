import {
  amsterdamYmd,
  dateInInclusiveRange,
  dayOf,
  eachDay,
  isoWeekParts,
  isoWeeksInRange,
  sameAmsterdamDate,
} from "../dates.js";
import {
  compactItem,
  mapStudiewijzerItem,
  type RawToekenning,
  type StudiewijzerItemView,
} from "./studiewijzer.js";
import { htmlToPlain } from "../html.js";
import { HOMEWORK_ADDITIONALS } from "../constants.js";
import { repeatedParams, type ApiClient } from "./client.js";
import type { HomeworkItem, ItemList } from "./types.js";

export type HomeworkView = {
  subject?: string;
  huiswerkType?: string;
  onderwerp?: string;
  omschrijving: string;
  datumTijd?: string;
  weeknummerVanaf?: number;
  weeknummerTm?: number;
  startGeldigheid?: string;
  eindGeldigheid?: string;
  inleveringenAantal?: number;
  inleveringenVerwacht?: number;
  bijlagen: string[];
};

export function homeworkQuery(
  leerlingId: number,
  extra?: URLSearchParams,
): URLSearchParams {
  const query = extra ? new URLSearchParams(extra) : new URLSearchParams();
  query.set(
    "geenDifferentiatieOfGedifferentieerdVoorLeerling",
    String(leerlingId),
  );
  repeatedParams("additional", HOMEWORK_ADDITIONALS, query);
  return query;
}

export function handInQuery(leerlingId: number): URLSearchParams {
  const query = homeworkQuery(leerlingId);
  query.set("studiewijzerItem.heeftInleverperiode", "true");
  return query;
}

export function filterDatedHomework(
  items: HomeworkItem[],
  ymd: string,
): HomeworkItem[] {
  return items.filter(
    (item) => item.datumTijd && sameAmsterdamDate(item.datumTijd, ymd),
  );
}

export function filterWeekHomework(
  items: HomeworkItem[],
  ymd: string,
): HomeworkItem[] {
  const { week } = isoWeekParts(ymd);
  return items.filter((item) => {
    if (item.weeknummerVanaf == null || item.weeknummerTm == null) {
      return false;
    }
    return item.weeknummerVanaf <= week && week <= item.weeknummerTm;
  });
}

export function filterHandInsForDate(
  items: HomeworkItem[],
  ymd: string,
): HomeworkItem[] {
  return items.filter((item) =>
    (item.studiewijzerItem?.inlevermomenten ?? []).some((window) =>
      dateInInclusiveRange(ymd, window.startGeldigheid, window.eindGeldigheid),
    ),
  );
}

export function mapHomework(item: HomeworkItem): HomeworkView {
  const lesgroep = item.lesgroep ?? item.additionalObjects?.lesgroep;
  const subject = lesgroep?.vak?.naam ?? lesgroep?.naam;
  const swi = item.studiewijzerItem;
  const window = swi?.inlevermomenten?.[0];
  const bijlagen = (swi?.bijlagen ?? [])
    .map((bijlage) => bijlage.bestand?.bestandsnaam)
    .filter((name): name is string => Boolean(name));

  return {
    subject,
    huiswerkType: swi?.huiswerkType,
    onderwerp: swi?.onderwerp,
    omschrijving: htmlToPlain(swi?.omschrijving),
    datumTijd: item.datumTijd,
    weeknummerVanaf: item.weeknummerVanaf,
    weeknummerTm: item.weeknummerTm,
    startGeldigheid: window?.startGeldigheid,
    eindGeldigheid: window?.eindGeldigheid,
    inleveringenAantal: window?.inleveringenAantal,
    inleveringenVerwacht: window?.inleveringenVerwacht,
    bijlagen,
  };
}

export async function fetchHomeworkSets(
  client: ApiClient,
  leerlingId: number,
  ymd: string,
): Promise<{
  afspraak: HomeworkItem[];
  dag: HomeworkItem[];
  week: HomeworkItem[];
  inlever: HomeworkItem[];
}> {
  const { year, week } = isoWeekParts(ymd);
  const weekQuery = homeworkQuery(leerlingId);
  weekQuery.set("jaarWeek", `${year}~${week}`);

  const weekOnly = homeworkQuery(leerlingId);
  weekOnly.set("weeknummer", String(week));

  const [afspraak, dag, weekItems, inlever] = await Promise.all([
    client.get<ItemList<HomeworkItem>>(
      "/studiewijzeritemafspraaktoekenningen",
      weekQuery,
    ),
    client.get<ItemList<HomeworkItem>>(
      "/studiewijzeritemdagtoekenningen",
      weekQuery,
    ),
    client.get<ItemList<HomeworkItem>>(
      "/studiewijzeritemweektoekenningen",
      weekOnly,
    ),
    client.get<ItemList<HomeworkItem>>(
      "/studiewijzeritemdagtoekenningen",
      handInQuery(leerlingId),
    ),
  ]);

  return {
    afspraak: afspraak.body.items ?? [],
    dag: dag.body.items ?? [],
    week: weekItems.body.items ?? [],
    inlever: inlever.body.items ?? [],
  };
}

export type HomeworkDay = {
  datum: string;
  items: StudiewijzerItemView[];
  /** Hand-in assignments whose deadline falls on this day. */
  deadlines: StudiewijzerItemView[];
};

export type HomeworkRange = {
  from: string;
  to: string;
  days: HomeworkDay[];
  /** Week tasks (studiewijzer items planned for a whole week) per ISO week. */
  weken: Array<{ jaar: number; week: number; items: StudiewijzerItemView[] }>;
};

/**
 * Everything in the study planner for a date range, the way the portal loads
 * it: per ISO week the lesson and day items (`jaarWeek`) and the week items
 * (`weeknummer`), plus all hand-ins, each list fully paged.
 */
export async function fetchHomeworkRange(
  client: ApiClient,
  leerlingId: number,
  from: string,
  to: string,
): Promise<HomeworkRange> {
  const weeks = isoWeeksInRange(from, to);
  const perWeek = await Promise.all(
    weeks.map(async ({ year, week }) => {
      const jaarWeekQuery = homeworkQuery(leerlingId);
      jaarWeekQuery.set("jaarWeek", `${year}~${week}`);
      const weekQuery = homeworkQuery(leerlingId);
      weekQuery.set("weeknummer", String(week));
      const [afspraak, dag, weekItems] = await Promise.all([
        client.getAll<RawToekenning>(
          "/studiewijzeritemafspraaktoekenningen",
          jaarWeekQuery,
        ),
        client.getAll<RawToekenning>(
          "/studiewijzeritemdagtoekenningen",
          jaarWeekQuery,
        ),
        client.getAll<RawToekenning>(
          "/studiewijzeritemweektoekenningen",
          weekQuery,
        ),
      ]);
      return {
        year,
        week,
        dated: [...afspraak.items, ...dag.items],
        weekItems: weekItems.items.filter(
          (item) =>
            (item.weeknummerVanaf ?? week) <= week &&
            week <= (item.weeknummerTm ?? week),
        ),
      };
    }),
  );
  const handIns = await client.getAll<RawToekenning>(
    "/studiewijzeritemdagtoekenningen",
    handInQuery(leerlingId),
  );

  const map = (raw: RawToekenning) =>
    compactItem(mapStudiewijzerItem(raw, leerlingId, amsterdamYmd));
  const seen = new Set<string>();
  const dated = perWeek
    .flatMap((entry) => entry.dated)
    .map(map)
    .filter((item) => {
      const key = `${item.soort}:${item.toekenningId ?? JSON.stringify(item)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const deadlines = handIns.items.map(map);

  const days = eachDay(from, to).map((datum) => ({
    datum,
    items: dated.filter((item) => item.datum === datum).sort(bySortering),
    deadlines: deadlines.filter(
      (item) => dayOf(item.inlevermoment?.eind) === datum,
    ),
  }));
  return {
    from,
    to,
    days,
    weken: perWeek
      .map((entry) => ({
        jaar: entry.year,
        week: entry.week,
        items: entry.weekItems.map(map).sort(bySortering),
      }))
      .filter((entry) => entry.items.length > 0),
  };
}

function bySortering(a: StudiewijzerItemView, b: StudiewijzerItemView): number {
  return (
    (a.datumTijd ?? "").localeCompare(b.datumTijd ?? "") ||
    (a.sortering ?? 0) - (b.sortering ?? 0)
  );
}
