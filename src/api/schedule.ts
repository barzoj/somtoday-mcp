import { amsterdamYmd, dayOf, eachDay, isoWeeksInRange } from "../dates.js";
import { htmlToPlain } from "../html.js";
import type { ApiClient } from "./client.js";
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
  days: Array<{ datum: string; vakantie?: string; items: ScheduleItemView[] }>;
}> {
  const notes: RawStatus[] = [];
  const weeks = await Promise.all(
    isoWeeksInRange(from, to).map(({ year, week }) =>
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
    ),
  );
  const meldingen = realMeldingen(notes);
  const holidays = (await client.getAll<RawHoliday>("/vakanties/verzorger"))
    .items;
  const items = weeks
    .flatMap((week) => week.items)
    .map(mapScheduleItem)
    .sort((a, b) => (a.begin ?? "").localeCompare(b.begin ?? ""));
  const vakanties = holidays
    .map((holiday) => {
      const [van, tot] = holidayBounds(holiday);
      return compact({ naam: holiday.naam, van, tot });
    })
    .filter(
      (holiday) =>
        holiday.van && holiday.tot && holiday.van <= to && holiday.tot >= from,
    );
  return {
    from,
    to,
    meldingen,
    vakanties,
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
