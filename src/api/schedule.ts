import { amsterdamYmd, dayOf, eachDay, isoWeeksInRange } from "../dates.js";
import { htmlToPlain } from "../html.js";
import { mapInBatches, WEEKS_PER_BATCH } from "./batch.js";
import {
  ApiNotAvailableError,
  listItems,
  parseContentRange,
  type ApiClient,
} from "./client.js";
import { linkId, simplify } from "./simplify.js";
import {
  compact,
  mapAttachment,
  type AttachmentView,
  type RawBijlage,
} from "./studiewijzer.js";

/** Same page cap as NONtoday AbstractState._unpaginatedGet (MAX_REQUESTS). */
const VAKANTIES_MAX_PAGES = 5;

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

/** One holiday GET attempt (templates only — no tokens or personal ids). */
export type VakantiesAttempt = {
  endpoint: string;
  httpStatus: number;
  itemCount: number;
};

export type HolidayLookup = {
  items: RawHoliday[];
  /** `"ok"` when at least one holiday was returned; `"empty"` when any source
   * answered HTTP 200 with no items (and none returned items); `"unavailable:<status>"`
   * only when every source answered 403/404. */
  vakantiesStatus: VakantiesStatus;
  /** Which path template produced the result (no personal ids). */
  vakantiesEndpoint: string;
  /** Every attempt, in order (templates only). */
  vakantiesAttempts: VakantiesAttempt[];
};

type HolidaySource = {
  endpoint: string;
  path: string;
  accept?: "platinum" | "json";
};

/**
 * Child entity ids to try for `/vakanties/leerling/{id}`.
 *
 * NONtoday VakantieState uses `getLeerlingID()` = JWT `leerlingen.ll[].id`
 * (parent: selected child), which equals `GET /leerlingen/{id}` self-link and
 * `restricties.leerlingId`. elisaado docs tell parents to take the id from
 * `GET /leerlingen`. We start from restricties (same as the rest of this MCP)
 * and also try self-link / list ids when they differ — never the parent
 * account/persoon UUID.
 */
export async function resolveVakantieLeerlingIds(
  client: ApiClient,
  fromRestricties: number,
): Promise<number[]> {
  const ids: number[] = [fromRestricties];
  const add = (id: number | undefined) => {
    if (typeof id === "number" && Number.isFinite(id) && !ids.includes(id)) {
      ids.push(id);
    }
  };
  // Best-effort only: restricties id is enough when /leerlingen is unavailable.
  try {
    const { body } = await client.get<{ links?: unknown[] }>(
      `/leerlingen/${fromRestricties}`,
    );
    add(linkId(body));
  } catch {
    // keep fromRestricties
  }
  try {
    const { items } = await client.getAll<{ links?: unknown[] }>("/leerlingen");
    for (const item of items) {
      add(linkId(item));
    }
  } catch {
    // keep ids discovered so far
  }
  return ids;
}

/**
 * Holiday list the way NONtoday AbstractState._unpaginatedGet does:
 * plain GET first (no Range); only later pages send Range from Content-Range.
 * No `additional` / schooljaar / date query — VakantieState uses none.
 */
async function getHolidayUnpaginated(
  client: ApiClient,
  source: HolidaySource,
): Promise<{ items: RawHoliday[]; unavailable?: number; httpStatus: number }> {
  try {
    const first = await client.get<unknown>(source.path, undefined, {
      accept: source.accept,
    });
    let items = listItems<RawHoliday>(first.body);
    let contentRange = first.contentRange;
    for (let page = 0; page < VAKANTIES_MAX_PAGES - 1; page += 1) {
      const range = parseContentRange(contentRange);
      if (!range || range.total === 0) {
        break;
      }
      const nextStart = range.end + 1;
      if (range.total !== undefined && nextStart >= range.total) {
        break;
      }
      const pageSize = Math.min(
        range.total !== undefined ? range.total - nextStart : 100,
        100,
      );
      const next = await client.get<unknown>(source.path, undefined, {
        accept: source.accept,
        range: { start: nextStart, end: nextStart + pageSize - 1 },
      });
      items = items.concat(listItems<RawHoliday>(next.body));
      contentRange = next.contentRange;
    }
    return { items, httpStatus: first.status };
  } catch (error) {
    if (error instanceof ApiNotAvailableError) {
      return { items: [], unavailable: error.status, httpStatus: error.status };
    }
    throw error;
  }
}

/**
 * Published holidays for one child. Tries sources in order and keeps the first
 * non-empty list:
 * 1. `/vakanties/leerling/{id}` platinum, unpaginated (NONtoday VakantieState /
 *    Cyfers / elisaado) — id is the child entity id, not the parent
 * 2. same path with `Accept: application/json`
 * 3. alternate child entity ids from `/leerlingen` when they differ
 * 4. `/vakanties/verzorger` (parent portal OpenAPI; often empty)
 *
 * Soft-fails 403/404 so schedule/lessons still return the timetable.
 * `unavailable:<status>` is reported only when every source failed that way;
 * a successful empty response wins over a later 403/404.
 */
export async function lookupHolidays(
  client: ApiClient,
  leerlingId: number,
): Promise<HolidayLookup> {
  const ids = await resolveVakantieLeerlingIds(client, leerlingId);
  const attempts: VakantiesAttempt[] = [];
  const sourcesFor = (id: number): HolidaySource[] => [
    {
      endpoint: VAKANTIES_LEERLING_ENDPOINT,
      path: `/vakanties/leerling/${id}`,
    },
    {
      endpoint: `${VAKANTIES_LEERLING_ENDPOINT}?accept=json`,
      path: `/vakanties/leerling/${id}`,
      accept: "json",
    },
  ];

  let lastUnavailable: number | undefined;
  let lastEndpoint = VAKANTIES_LEERLING_ENDPOINT;
  /** True once any source answered HTTP 200/206 (even with items:[]). */
  let sawSuccess = false;

  for (const id of ids) {
    for (const source of sourcesFor(id)) {
      const page = await getHolidayUnpaginated(client, source);
      attempts.push({
        endpoint: source.endpoint,
        httpStatus: page.httpStatus,
        itemCount: page.items.length,
      });
      if (page.unavailable !== undefined) {
        if (!sawSuccess) {
          lastUnavailable = page.unavailable;
          lastEndpoint = source.endpoint;
        }
        continue;
      }
      sawSuccess = true;
      if (page.items.length > 0) {
        return {
          items: page.items,
          vakantiesStatus: "ok",
          vakantiesEndpoint: source.endpoint,
          vakantiesAttempts: attempts,
        };
      }
      lastUnavailable = undefined;
      lastEndpoint = source.endpoint;
    }
  }

  const verzorger: HolidaySource = {
    endpoint: VAKANTIES_VERZORGER_ENDPOINT,
    path: VAKANTIES_VERZORGER_ENDPOINT,
  };
  const verzorgerPage = await getHolidayUnpaginated(client, verzorger);
  attempts.push({
    endpoint: verzorger.endpoint,
    httpStatus: verzorgerPage.httpStatus,
    itemCount: verzorgerPage.items.length,
  });
  if (verzorgerPage.unavailable !== undefined) {
    if (!sawSuccess) {
      lastUnavailable = verzorgerPage.unavailable;
      lastEndpoint = verzorger.endpoint;
    }
  } else {
    sawSuccess = true;
    if (verzorgerPage.items.length > 0) {
      return {
        items: verzorgerPage.items,
        vakantiesStatus: "ok",
        vakantiesEndpoint: verzorger.endpoint,
        vakantiesAttempts: attempts,
      };
    }
    lastUnavailable = undefined;
    lastEndpoint = verzorger.endpoint;
  }

  if (!sawSuccess && lastUnavailable !== undefined) {
    return {
      items: [],
      vakantiesStatus: `unavailable:${lastUnavailable}`,
      vakantiesEndpoint: lastEndpoint,
      vakantiesAttempts: attempts,
    };
  }
  return {
    items: [],
    vakantiesStatus: "empty",
    vakantiesEndpoint: lastEndpoint,
    vakantiesAttempts: attempts,
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
  vakantiesAttempts: VakantiesAttempt[];
}> {
  const lookup = await lookupHolidays(client, leerlingId);
  return {
    vakanties: mapHolidayViews(lookup.items),
    vakantiesStatus: lookup.vakantiesStatus,
    vakantiesEndpoint: lookup.vakantiesEndpoint,
    vakantiesAttempts: lookup.vakantiesAttempts,
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
  vakantiesAttempts: VakantiesAttempt[];
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
    vakantiesAttempts: lookup.vakantiesAttempts,
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
