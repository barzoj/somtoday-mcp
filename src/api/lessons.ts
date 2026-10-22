import {
  dateInInclusiveRange,
  isoWeekParts,
  sameAmsterdamDate,
} from "../dates.js";
import type { ApiClient } from "./client.js";
import { CANCELLED_STATUS } from "./schedule.js";
import type { AfspraakItem, HolidayItem, ItemList } from "./types.js";

export type LessonView = {
  beginDatumTijd?: string;
  eindDatumTijd?: string;
  beginLesuur?: number;
  eindLesuur?: number;
  locatie?: string;
  titel?: string;
  vak?: { naam?: string; afkorting?: string };
  docentNamen?: string[];
  /** Appointment type, e.g. LES, ROOSTERTOETS (a test in the timetable), EXAMEN. */
  type?: string;
  uitgevallen?: boolean;
};

export function filterLessonsForDate(
  items: AfspraakItem[],
  ymd: string,
): LessonView[] {
  return items
    .filter(
      (item) =>
        item.beginDatumTijd && sameAmsterdamDate(item.beginDatumTijd, ymd),
    )
    .map((item) => ({
      beginDatumTijd: item.beginDatumTijd,
      eindDatumTijd: item.eindDatumTijd,
      beginLesuur: item.beginLesuur,
      eindLesuur: item.eindLesuur,
      locatie: item.locatie,
      titel: item.titel,
      vak: item.vak
        ? { naam: item.vak.naam, afkorting: item.vak.afkorting }
        : undefined,
      docentNamen: item.docentNamen,
      type: item.afspraakItemType,
      uitgevallen:
        item.statusNotifications?.some(
          (note) => note.status === CANCELLED_STATUS,
        ) || undefined,
    }));
}

export function holidaysOnDate(
  items: HolidayItem[],
  ymd: string,
): HolidayItem[] {
  return items.filter((item) => {
    const start = item.beginDatum ?? item.startDatum ?? item.vanafDatum;
    const end = item.eindDatum ?? item.totDatum;
    return dateInInclusiveRange(ymd, start, end);
  });
}

export async function fetchWeekLessons(
  client: ApiClient,
  leerlingId: number,
  ymd: string,
): Promise<AfspraakItem[]> {
  const { year, week } = isoWeekParts(ymd);
  const { body } = await client.get<ItemList<AfspraakItem>>(
    `/afspraakitems/${leerlingId}/jaar/${year}/week/${week}`,
  );
  return body.items ?? [];
}

export async function fetchHolidays(client: ApiClient): Promise<HolidayItem[]> {
  const { body } = await client.get<ItemList<HolidayItem>>(
    "/vakanties/verzorger",
  );
  return body.items ?? [];
}
