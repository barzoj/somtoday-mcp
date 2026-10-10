import { dateInInclusiveRange, isoWeekParts, sameAmsterdamDate } from "../dates.js";
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

export function homeworkQuery(leerlingId: number, extra?: URLSearchParams): URLSearchParams {
  const query = extra ? new URLSearchParams(extra) : new URLSearchParams();
  query.set("geenDifferentiatieOfGedifferentieerdVoorLeerling", String(leerlingId));
  repeatedParams("additional", HOMEWORK_ADDITIONALS, query);
  return query;
}

export function handInQuery(leerlingId: number): URLSearchParams {
  const query = homeworkQuery(leerlingId);
  query.set("studiewijzerItem.heeftInleverperiode", "true");
  return query;
}

export function filterDatedHomework(items: HomeworkItem[], ymd: string): HomeworkItem[] {
  return items.filter((item) => item.datumTijd && sameAmsterdamDate(item.datumTijd, ymd));
}

export function filterWeekHomework(items: HomeworkItem[], ymd: string): HomeworkItem[] {
  const { week } = isoWeekParts(ymd);
  return items.filter((item) => {
    if (item.weeknummerVanaf == null || item.weeknummerTm == null) {
      return false;
    }
    return item.weeknummerVanaf <= week && week <= item.weeknummerTm;
  });
}

export function filterHandInsForDate(items: HomeworkItem[], ymd: string): HomeworkItem[] {
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
    client.get<ItemList<HomeworkItem>>("/studiewijzeritemafspraaktoekenningen", weekQuery),
    client.get<ItemList<HomeworkItem>>("/studiewijzeritemdagtoekenningen", weekQuery),
    client.get<ItemList<HomeworkItem>>("/studiewijzeritemweektoekenningen", weekOnly),
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
