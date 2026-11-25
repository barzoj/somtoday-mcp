import { describe, expect, it } from "vitest";
import { scheduleTool } from "../../src/tools/schedule.js";
import {
  accountMe,
  accountMeChildren,
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";
import { herfstvakantie2026, kerstvakantie2026 } from "../fixtures/holidays.js";

const afspraak = (begin: string, extra: Record<string, unknown> = {}) => ({
  $type: "participatie.live.RAfspraakItem",
  links: [{ id: 300, rel: "self" }],
  afspraakItemType: "ROOSTER",
  beginDatumTijd: begin,
  eindDatumTijd: begin.replace("T08", "T09"),
  beginLesuur: 2,
  eindLesuur: 2,
  bijlagen: [],
  docentNamen: ["Docent A"],
  lesgroepen: [],
  locatie: "B1.02",
  omschrijving: "<p>Neem schrift mee</p>",
  onlineDeelname: false,
  statusNotifications: [],
  titel: "wi - Docent A",
  uniqueIdentifier: "u",
  vak: {
    $type: "participatie.live.RAfspraakVak",
    UUID: "v",
    afkorting: "wi",
    id: 1,
    naam: "Wiskunde",
  },
  wijzigingOmschrijving: "",
  ...extra,
});

describe("schedule", () => {
  it("returns lessons per day with changes, type, notes and holidays", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/afspraakitems\/4242\/jaar\/2026\/week\/52/,
        () =>
          jsonResponse(
            206,
            {
              items: [
                afspraak("2026-12-21T08:00:00Z", {
                  statusNotifications: [
                    { status: "2002", message: "Inschrijving in orde." },
                  ],
                }),
                afspraak("2026-12-23T08:00:00Z", {
                  statusNotifications: [
                    { status: "2002", message: "Inschrijving in orde." },
                    { status: "4007", message: "Les vervalt" },
                  ],
                }),
                afspraak("2026-12-22T08:00:00Z", {
                  afspraakItemType: "ROOSTERTOETS",
                  wijzigingOmschrijving: "Lokaal gewijzigd",
                  statusNotifications: [
                    {
                      $type: "x",
                      status: "GEWIJZIGD",
                      message: "Ander lokaal",
                    },
                  ],
                  beginLesuur: 3,
                  eindLesuur: 4,
                }),
              ],
              statusNotifications: [
                { status: "INFO", message: "Rooster bijgewerkt" },
                { status: "2002", message: "Inschrijving in orde." },
                { status: "INFO", message: "Rooster bijgewerkt" },
              ],
            },
            { "content-range": "items 0-2/3" },
          ),
      ],
      [/\/afspraakitems\/4242\/jaar\/2026\/week\/53/, () => listResponse([])],
      [/\/vakanties\/verzorger/, () => listResponse([])],
      [
        /\/vakanties\/leerling\/4242/,
        () => listResponse([kerstvakantie2026, herfstvakantie2026]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await scheduleTool(ctx, { from: "2026-12-21", to: "2026-12-28" }),
    ) as {
      meldingen: unknown[];
      vakanties: unknown[];
      days: Array<{
        datum: string;
        vakantie?: string;
        items?: Array<Record<string, unknown>>;
      }>;
    };
    expect(out.meldingen).toEqual([
      { status: "INFO", message: "Rooster bijgewerkt" },
    ]);
    expect(out.vakanties).toEqual([
      { naam: "Kerstvakantie", van: "2026-12-21", tot: "2027-01-03" },
    ]);
    expect(out.days).toHaveLength(8);
    expect(out.days[0]!.items![0]).toMatchObject({
      id: 300,
      lesuur: "2",
      type: "ROOSTER",
      vak: "Wiskunde",
      locatie: "B1.02",
      docenten: ["Docent A"],
      omschrijving: "Neem schrift mee",
    });
    expect(out.days[0]).toMatchObject({
      datum: "2026-12-21",
      vakantie: "Kerstvakantie",
    });
    expect(out.days[1]!.items![0]).toMatchObject({
      lesuur: "3-4",
      type: "ROOSTERTOETS",
      wijziging: "Lokaal gewijzigd",
      meldingen: [{ status: "GEWIJZIGD", message: "Ander lokaal" }],
    });
    expect(out.days[0]!.items![0]!.meldingen).toBeUndefined();
    expect(out.days[0]!.items![0]!.uitgevallen).toBeUndefined();
    expect(out.days[2]!.items![0]).toMatchObject({
      uitgevallen: true,
      meldingen: [{ status: "4007", message: "Les vervalt" }],
    });
    expect(out.days[5]).toEqual({
      datum: "2026-12-26",
      vakantie: "Kerstvakantie",
      items: [],
    });
    expect(out.days[3]).toEqual({
      datum: "2026-12-24",
      vakantie: "Kerstvakantie",
      items: [],
    });
    expect(
      calls.filter((call) => call.url.pathname.includes("afspraakitems")),
    ).toHaveLength(2);
    expect(
      calls.some((call) =>
        call.url.pathname.includes("/vakanties/leerling/4242"),
      ),
    ).toBe(true);
  });

  it("respects roosterBekijkenAan", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242, { roosterBekijkenAan: false })],
    ]);
    const ctx = await toolContext(fetchFn);
    expect(toolJson(await scheduleTool(ctx, {})).available).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("keeps the timetable when holidays 403 and returns empty vakanties", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/afspraakitems\/4242\/jaar\/2026\/week\/52/, () => listResponse([])],
      [
        /\/vakanties\/leerling\/4242/,
        () => jsonResponse(403, { message: "forbidden" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await scheduleTool(ctx, { from: "2026-12-21", to: "2026-12-21" }),
    ) as {
      vakanties: unknown[];
      days: Array<{ datum: string; vakantie?: string; items: unknown[] }>;
    };
    expect(out.vakanties).toEqual([]);
    expect(out.days).toEqual([{ datum: "2026-12-21", items: [] }]);
  });

  it("surfaces non-403 holiday failures instead of emptying vakanties", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/afspraakitems\/4242\/jaar\/2026\/week\/52/, () => listResponse([])],
      [
        /\/vakanties\/leerling\/4242/,
        () => jsonResponse(500, { message: "boom" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const result = await scheduleTool(ctx, {
      from: "2026-12-21",
      to: "2026-12-21",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/API HTTP 500/);
  });

  it("fetches holidays for the requested child when several are linked", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMeChildren([4242, 5252])],
      [/\/afspraakitems\/5252\/jaar\/2026\/week\/52/, () => listResponse([])],
      [/\/vakanties\/leerling\/5252/, () => listResponse([kerstvakantie2026])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await scheduleTool(ctx, {
        from: "2026-12-21",
        to: "2026-12-21",
        leerlingId: "5252",
      }),
    ) as {
      leerlingId: number;
      vakanties: Array<{ naam?: string }>;
      days: Array<{ vakantie?: string }>;
    };
    expect(out.leerlingId).toBe(5252);
    expect(out.vakanties).toEqual([
      { naam: "Kerstvakantie", van: "2026-12-21", tot: "2027-01-03" },
    ]);
    expect(out.days[0]?.vakantie).toBe("Kerstvakantie");
    expect(
      calls.some((call) =>
        call.url.pathname.includes("/vakanties/leerling/5252"),
      ),
    ).toBe(true);
  });
});
