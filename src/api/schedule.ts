import { amsterdamYmd, dayOf, eachDay, isoWeeksInRange } from "../dates.js";
import { htmlToPlain } from "../html.js";
import { mapInBatches, WEEKS_PER_BATCH } from "./batch.js";
import { ApiNotAvailableError, listItems, type ApiClient } from "./client.js";
import { linkId, simplify } from "./simplify.js";
import {
  compact,
  mapAttachment,
  type AttachmentView,
  type RawBijlage,
} from "./studiewijzer.js";

type RawStatus = { status?: string; message?: string };
type RawAfspraak = {
  links?: unknown[];
  afspraakItemType?: string;
  beginDatumTijd?: string;
  eindDatumTijd?: string;
  beginLesuur?: number;
  eindLesuur?: number;
  titel?: string;
  locatie?: string;
  omschrijving?: string;
  wijzigingOmschrijving?: string;
  onlineDeelname?: boolean;
  docentNamen?: string[];
  lesgroepen?: Array<{ naam?: string }>;
  vak?: { naam?: string; afkorting?: string; UUID?: string };
  bijlagen?: RawBijlage[];
  statusNotifications?: RawStatus[];
  uniqueIdentifier?: string;
  afspraakActies?: unknown;
  inschrijfStatus?: unknown;
  kwtInfo?: unknown;
};
type RawHoliday = {
  naam?: string;
  beginDatum?: string;
  eindDatum?: string;
  startDatum?: string;
  totDatum?: string;
  vanafDatum?: string;
};

/** "Inschrijving in orde." – informational, repeated on every item; not a warning. */
const INFO_STATUSES = new Set(["2002"]);
/** The portal marks an appointment as cancelled (uitgevallen) with this status. */
export const CANCELLED_STATUS = "4007";

function realMeldingen(notes: RawStatus[] | undefined): RawStatus[] {
  const seen = new Set<string>();
  const out: RawStatus[] = [];
  for (const note of notes ?? []) {
    if (note.status && INFO_STATUSES.has(note.status)) continue;
    const key = `${note.status ?? ""}|${note.message ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(compact({ status: note.status, message: note.message }));
  }
  return out;
}

export type ScheduleItemView = {
  id?: number;
  begin?: string;
  eind?: string;
  lesuur?: string;
  type?: string;
  vak?: string;
  vakAfkorting?: string;
  titel?: string;
  locatie?: string;
  docenten?: string[];
  lesgroepen?: string[];
  omschrijving?: string;
  wijziging?: string;
  meldingen?: RawStatus[];
  uitgevallen?: boolean;
  online?: boolean;
  bijlagen?: AttachmentView[];
  keuzewerktijd?: unknown;
};

export function mapScheduleItem(raw: RawAfspraak): ScheduleItemView {
  const lesuur =
    raw.beginLesuur === undefined
      ? undefined
      : raw.eindLesuur && raw.eindLesuur !== raw.beginLesuur
        ? `${raw.beginLesuur}-${raw.eindLesuur}`
        : String(raw.beginLesuur);
  const kwt = simplify({
    afspraakActies: raw.afspraakActies,
    inschrijfStatus: raw.inschrijfStatus,
    kwtInfo: raw.kwtInfo,
  });
  return compact({
    id: linkId(raw),
    begin: raw.beginDatumTijd,
    eind: raw.eindDatumTijd,
    lesuur,
    type: raw.afspraakItemType,
    vak: raw.vak?.naam,
    vakAfkorting: raw.vak?.afkorting,
    titel: raw.titel,
    locatie: raw.locatie || undefined,
    docenten: raw.docentNamen,
    lesgroepen: raw.lesgroepen
      ?.map((groep) => groep.naam)
      .filter((naam): naam is string => Boolean(naam)),
    omschrijving: htmlToPlain(raw.omschrijving) || undefined,
    wijziging: raw.wijzigingOmschrijving || undefined,
    meldingen: realMeldingen(raw.statusNotifications),
    uitgevallen:
      raw.statusNotifications?.some(
        (note) => note.status === CANCELLED_STATUS,
      ) || undefined,
    online: raw.onlineDeelname || undefined,
    bijlagen: (raw.bijlagen ?? [])
      .map(mapAttachment)
      .filter((value): value is AttachmentView => Boolean(value)),
    keuzewerktijd: kwt,
  });
}

function holidayBounds(holiday: RawHoliday): [string?, string?] {
  return [
    dayOf(holiday.beginDatum ?? holiday.startDatum ?? holiday.vanafDatum),
    dayOf(holiday.eindDatum ?? holiday.totDatum),
  ];
}

/** Path templates only — never embed a real leerling id (privacy). */
export const VAKANTIES_LEERLING_ENDPOINT = "/vakanties/leerling/{leerlingId}";
export const VAKANTIES_VERZORGER_ENDPOINT = "/vakanties/verzorger";

export type VakantiesStatus = "ok" | "empty" | `unavailable:${number}`;

export type HolidayLookup = {
  items: RawHoliday[];
  /** `"ok"` when at least one holiday was returned; `"empty"` for HTTP 200 with
   * no items after all sources; `"unavailable:<status>"` when every source
   * answered 403/404. */
  vakantiesStatus: VakantiesStatus;
  /** Which path template produced the result (no personal ids). */
  vakantiesEndpoint: string;
};

type HolidaySource = {
  endpoint: string;
  path: string;
  accept?: "platinum" | "json";
};

/**
 * One holiday GET without a Range header.
 *
 * The official leerling app (NONtoday/leerling-source AbstractState) loads
 * `vakanties/leerling/{id}` with a plain first request — Range only appears on
 * later pages. Our generic `getAll` always sends `Range: items=0-99`, which for
 * this endpoint can yield an empty page on parent accounts. Holiday lists are
 * small enough that one unpaged GET matches the app.
 */
async function getHolidayPage(
  client: ApiClient,
  source: HolidaySource,
): Promise<{ items: RawHoliday[]; unavailable?: number }> {
  try {
    const { body } = await client.get<unknown>(source.path, undefined, {
      accept: source.accept,
    });
    return { items: listItems<RawHoliday>(body) };
  } catch (error) {
    if (error instanceof ApiNotAvailableError) {
      return { items: [], unavailable: error.status };
    }
    throw error;
  }
}

/**
 * Published holidays for one child. Tries sources in order and keeps the first
 * non-empty list:
 * 1. `/vakanties/leerling/{id}` platinum, no Range (official leerling app /
 *    Cyfers docs / elisaado)
 * 2. same path with `Accept: application/json` (school-buddy, ha-somtoday,
 *    digital-IMEI)
 * 3. `/vakanties/verzorger` (parent portal OpenAPI; often empty)
 *
 * Soft-fails 403/404 so schedule/lessons still return the timetable.
 */
export async function lookupHolidays(
  client: ApiClient,
  leerlingId: number,
): Promise<HolidayLookup> {
  const leerlingPath = `/vakanties/leerling/${leerlingId}`;
  const sources: HolidaySource[] = [
    {
      endpoint: VAKANTIES_LEERLING_ENDPOINT,
      path: leerlingPath,
    },
    {
      endpoint: `${VAKANTIES_LEERLING_ENDPOINT}?accept=json`,
      path: leerlingPath,
      accept: "json",
    },
    {
      endpoint: VAKANTIES_VERZORGER_ENDPOINT,
      path: VAKANTIES_VERZORGER_ENDPOINT,
    },
  ];

  let lastUnavailable: number | undefined;
  let lastEmptyEndpoint = sources[0]!.endpoint;

  for (const source of sources) {
    const page = await getHolidayPage(client, source);
    if (page.unavailable !== undefined) {
      lastUnavailable = page.unavailable;
      lastEmptyEndpoint = source.endpoint;
      continue;
    }
    if (page.items.length > 0) {
      return {
        items: page.items,
        vakantiesStatus: "ok",
        vakantiesEndpoint: source.endpoint,
      };
    }
    lastUnavailable = undefined;
    lastEmptyEndpoint = source.endpoint;
  }

  if (lastUnavailable !== undefined) {
    return {
      items: [],
      vakantiesStatus: `unavailable:${lastUnavailable}`,
      vakantiesEndpoint: lastEmptyEndpoint,
    };
  }
  return {
    items: [],
    vakantiesStatus: "empty",
    vakantiesEndpoint: lastEmptyEndpoint,
  };
}

/** @deprecated Prefer {@link lookupHolidays}; kept for call sites that only need items. */
export async function fetchHolidayItems(
  client: ApiClient,
  leerlingId: number,
): Promise<RawHoliday[]> {
  return (await lookupHolidays(client, leerlingId)).items;
}

function mapHolidayViews(
  items: RawHoliday[],
): Array<{ naam?: string; van?: string; tot?: string }> {
  return items
    .map((holiday) => {
      const [van, tot] = holidayBounds(holiday);
      return compact({ naam: holiday.naam, van, tot });
    })
    .sort((a, b) => (a.van ?? "").localeCompare(b.van ?? ""));
}

/** Every holiday and day off published for this child (school Vakanties page). */
export async function fetchHolidays(
  client: ApiClient,
  leerlingId: number,
): Promise<{
  vakanties: Array<{ naam?: string; van?: string; tot?: string }>;
  vakantiesStatus: VakantiesStatus;
  vakantiesEndpoint: string;
}> {
  const lookup = await lookupHolidays(client, leerlingId);
  return {
    vakanties: mapHolidayViews(lookup.items),
    vakantiesStatus: lookup.vakantiesStatus,
    vakantiesEndpoint: lookup.vakantiesEndpoint,
  };
}

/**
 * Stable id for merge/dedupe across week windows. Prefer appointment id;
 * when missing, fall back to the whole object so distinct items stay distinct.
 */
export function scheduleItemKey(item: ScheduleItemView): string {
  if (item.id != null) {
    return String(item.id);
  }
  return JSON.stringify(item);
}

/**
 * Timetable for a date range, loaded the way the portal does: one request per
 * ISO week (batched), then merged and deduped by {@link scheduleItemKey}.
 */
export async function fetchSchedule(
  client: ApiClient,
  leerlingId: number,
  from: string,
  to: string,
): Promise<{
  from: string;
  to: string;
  meldingen: RawStatus[];
  vakanties: Array<{ naam?: string; van?: string; tot?: string }>;
  vakantiesStatus: VakantiesStatus;
  vakantiesEndpoint: string;
  days: Array<{ datum: string; vakantie?: string; items: ScheduleItemView[] }>;
}> {
  const notes: RawStatus[] = [];
  const weeks = await mapInBatches(
    isoWeeksInRange(from, to),
    WEEKS_PER_BATCH,
    ({ year, week }) =>
      client.getAll<RawAfspraak>(
        `/afspraakitems/${leerlingId}/jaar/${year}/week/${week}`,
        undefined,
        {
          onPage: (body) => {
            notes.push(
              ...((body as { statusNotifications?: RawStatus[] })
                ?.statusNotifications ?? []),
            );
          },
        },
      ),
  );
  const meldingen = realMeldingen(notes);
  const lookup = await lookupHolidays(client, leerlingId);
  const seen = new Set<string>();
  const items = weeks
    .flatMap((week) => week.items)
    .map(mapScheduleItem)
    .filter((item) => {
      const key = scheduleItemKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.begin ?? "").localeCompare(b.begin ?? ""));
  const vakanties = mapHolidayViews(lookup.items).filter(
    (holiday) =>
      holiday.van && holiday.tot && holiday.van <= to && holiday.tot >= from,
  );
  return {
    from,
    to,
    meldingen,
    vakanties,
    vakantiesStatus: lookup.vakantiesStatus,
    vakantiesEndpoint: lookup.vakantiesEndpoint,
    // Every day keeps `items` (also when empty), like homework.
    days: eachDay(from, to).map((datum) => ({
      ...compact({
        datum,
        vakantie: vakanties.find(
          (holiday) => holiday.van! <= datum && datum <= holiday.tot!,
        )?.naam,
      }),
      items: items.filter(
        (item) => item.begin && amsterdamYmd(item.begin) === datum,
      ),
    })),
  };
}
