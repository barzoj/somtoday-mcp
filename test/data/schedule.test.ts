import { describe, expect, it } from "vitest";
import { scheduleItemKey } from "../../src/api/schedule.js";
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

describe("scheduleItemKey", () => {
  it("prefers id when present", () => {
    expect(scheduleItemKey({ id: 7, begin: "2026-01-05T08:00:00Z" })).toBe("7");
  });

  it("falls back to the whole object when id is missing", () => {
    const a = { begin: "2026-01-05T08:00:00Z", titel: "Alpha" };
    const b = { begin: "2026-01-05T10:00:00Z", titel: "Beta" };
    expect(scheduleItemKey(a)).toBe(JSON.stringify(a));
    expect(scheduleItemKey(b)).toBe(JSON.stringify(b));
    expect(scheduleItemKey(a)).not.toBe(scheduleItemKey(b));
  });
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
                  links: [{ id: 301, rel: "self" }],
                  statusNotifications: [
                    { status: "2002", message: "Inschrijving in orde." },
                  ],
                }),
                afspraak("2026-12-23T08:00:00Z", {
                  links: [{ id: 303, rel: "self" }],
                  statusNotifications: [
                    { status: "2002", message: "Inschrijving in orde." },
                    { status: "4007", message: "Les vervalt" },
                  ],
                }),
                afspraak("2026-12-22T08:00:00Z", {
                  links: [{ id: 302, rel: "self" }],
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
    expect((out as { vakantiesStatus?: string }).vakantiesStatus).toBe("ok");
    expect((out as { vakantiesEndpoint?: string }).vakantiesEndpoint).toBe(
      "/vakanties/leerling/{leerlingId}",
    );
    expect(
      calls
        .filter((call) => call.url.pathname.includes("/vakanties/"))
        .every((call) => call.headers.get("range") === null),
    ).toBe(true);
    expect(out.days).toHaveLength(8);
    expect(out.days[0]!.items![0]).toMatchObject({
      id: 301,
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

  it("reads ranges longer than 42 days week by week, at most 6 weeks at a time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slowEmpty = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return listResponse([]);
    };
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/afspraakitems\//, slowEmpty],
      [/\/vakanties\/leerling\/4242/, () => listResponse([])],
      [/\/vakanties\/verzorger/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    // 2026-08-24 .. 2026-12-31 = 130 days (the failing live call).
    const out = toolJson(
      await scheduleTool(ctx, { from: "2026-08-24", to: "2026-12-31" }),
    ) as { days: unknown[]; vakantiesStatus: string };
    expect(out.days).toHaveLength(130);
    expect(out.vakantiesStatus).toBe("empty");
    const weekCalls = calls.filter((call) =>
      call.url.pathname.includes("afspraakitems"),
    );
    // ISO weeks 2026~35 (Mon 24 Aug) through 2026~53 = 19 weeks
    expect(weekCalls).toHaveLength(19);
    expect(maxInFlight).toBeLessThanOrEqual(6);
  });

  it("merges a long range across week windows: all items, no duplicates, sorted by date", async () => {
    // 2026-01-05 (Mon, ISO 2026~2) .. 2026-05-04 (Mon, ISO 2026~19) = 120 days.
    // Same appointment id returned from an adjacent week must appear once.
    const firstDay = "2026-01-05";
    const lastDay = "2026-05-04";
    const midDay = "2026-03-04";
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/afspraakitems\/4242\/jaar\/2026\/week\/2/,
        () =>
          listResponse([
            afspraak("2026-01-05T08:00:00Z", {
              links: [{ id: 101, rel: "self" }],
            }),
            afspraak("2026-01-05T10:00:00Z", {
              links: [{ id: 102, rel: "self" }],
            }),
          ]),
      ],
      [
        /\/afspraakitems\/4242\/jaar\/2026\/week\/3/,
        () =>
          listResponse([
            afspraak("2026-01-05T10:00:00Z", {
              links: [{ id: 102, rel: "self" }],
            }),
          ]),
      ],
      [
        /\/afspraakitems\/4242\/jaar\/2026\/week\/10/,
        () =>
          listResponse([
            afspraak("2026-03-04T09:00:00Z", {
              links: [{ id: 110, rel: "self" }],
            }),
          ]),
      ],
      [
        /\/afspraakitems\/4242\/jaar\/2026\/week\/19/,
        () =>
          listResponse([
            afspraak("2026-05-04T08:00:00Z", {
              links: [{ id: 119, rel: "self" }],
            }),
          ]),
      ],
      [/\/afspraakitems\//, () => listResponse([])],
      [/\/vakanties\/leerling\/4242/, () => listResponse([])],
      [/\/vakanties\/verzorger/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await scheduleTool(ctx, { from: firstDay, to: lastDay }),
    ) as {
      from: string;
      to: string;
      days: Array<{
        datum: string;
        items: Array<{ id?: number; begin?: string }>;
      }>;
    };

    expect(out.from).toBe(firstDay);
    expect(out.to).toBe(lastDay);
    expect(out.days).toHaveLength(120);
    expect(out.days.map((day) => day.datum)).toEqual(
      out.days.map((day) => day.datum).toSorted(),
    );
    expect(out.days[0]!.datum).toBe(firstDay);
    expect(out.days[119]!.datum).toBe(lastDay);

    const allItems = out.days.flatMap((day) => day.items);
    expect(allItems.map((item) => item.id).toSorted()).toEqual([
      101, 102, 110, 119,
    ]);
    expect(out.days[0]!.items.map((item) => item.id)).toEqual([101, 102]);
    const mid = out.days.find((day) => day.datum === midDay);
    expect(mid!.items.map((item) => item.id)).toEqual([110]);
    expect(out.days[119]!.items.map((item) => item.id)).toEqual([119]);

    const weekCalls = calls.filter((call) =>
      call.url.pathname.includes("afspraakitems"),
    );
    expect(weekCalls).toHaveLength(18);
  });

  it("keeps distinct items that have no id instead of collapsing them", async () => {
    const withoutId = (begin: string, titel: string) =>
      afspraak(begin, {
        links: [],
        titel,
        uniqueIdentifier: titel,
      });
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/afspraakitems\/4242\/jaar\/2026\/week\/2/,
        () =>
          listResponse([
            withoutId("2026-01-05T08:00:00Z", "Alpha"),
            withoutId("2026-01-05T10:00:00Z", "Beta"),
          ]),
      ],
      [/\/afspraakitems\//, () => listResponse([])],
      [/\/vakanties\/leerling\/4242/, () => listResponse([])],
      [/\/vakanties\/verzorger/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await scheduleTool(ctx, { from: "2026-01-05", to: "2026-01-05" }),
    ) as {
      days: Array<{ items: Array<{ titel?: string; id?: number }> }>;
    };
    expect(out.days[0]!.items.map((item) => item.titel).toSorted()).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(out.days[0]!.items.every((item) => item.id == null)).toBe(true);
  });

  it("refuses ranges over 350 days", async () => {
    const { fetchFn } = routedFetch([[/\/account\/me/, () => accountMe(4242)]]);
    const ctx = await toolContext(fetchFn);
    const result = await scheduleTool(ctx, {
      from: "2026-08-01",
      to: "2027-07-31",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/at most 350/);
  });

  it("keeps the timetable when holidays 403 and returns empty vakanties", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/afspraakitems\/4242\/jaar\/2026\/week\/52/, () => listResponse([])],
      [
        /\/vakanties\/leerling\/4242/,
        () => jsonResponse(403, { message: "forbidden" }),
      ],
      [
        /\/vakanties\/verzorger/,
        () => jsonResponse(403, { message: "forbidden" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await scheduleTool(ctx, { from: "2026-12-21", to: "2026-12-21" }),
    ) as {
      vakanties: unknown[];
      vakantiesStatus: string;
      days: Array<{ datum: string; vakantie?: string; items: unknown[] }>;
    };
    expect(out.vakanties).toEqual([]);
    expect(out.vakantiesStatus).toBe("unavailable:403");
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
      vakantiesAttempts: Array<{
        endpoint: string;
        httpStatus: number;
        itemCount: number;
      }>;
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
    expect(out.vakantiesAttempts).toEqual([
      {
        endpoint: "/vakanties/leerling/{leerlingId}",
        httpStatus: 206,
        itemCount: 1,
      },
    ]);
  });

  it("retries vakanties with the /leerlingen self-link id when restricties id is empty", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(9999)],
      [/\/afspraakitems\/9999\//, () => listResponse([])],
      [
        /\/leerlingen\/9999$/,
        () =>
          jsonResponse(200, {
            links: [{ id: 4242, rel: "self", type: "leerling.RLeerling" }],
          }),
      ],
      [/\/vakanties\/leerling\/9999/, () => listResponse([])],
      [/\/vakanties\/leerling\/4242/, () => listResponse([kerstvakantie2026])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await scheduleTool(ctx, { from: "2026-12-21", to: "2026-12-28" }),
    ) as {
      vakanties: Array<{ naam?: string }>;
      vakantiesStatus: string;
      vakantiesAttempts: Array<{ itemCount: number; endpoint: string }>;
    };
    expect(out.vakantiesStatus).toBe("ok");
    expect(out.vakanties).toEqual([
      { naam: "Kerstvakantie", van: "2026-12-21", tot: "2027-01-03" },
    ]);
    expect(
      calls.some((call) =>
        call.url.pathname.includes("/vakanties/leerling/4242"),
      ),
    ).toBe(true);
    expect(out.vakantiesAttempts.at(-1)?.itemCount).toBe(1);
  });

  it("does not use a sibling's vakanties id when several children are linked", async () => {
    // Parent with two kids: requested child's leerling endpoints stay empty;
    // sibling has holidays. Must not leak the sibling's list into this child.
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMeChildren([1111, 2222])],
      [/\/afspraakitems\/1111\//, () => listResponse([])],
      [
        /\/leerlingen\/1111$/,
        () =>
          jsonResponse(200, {
            links: [{ id: 1111, rel: "self", type: "leerling.RLeerling" }],
          }),
      ],
      [
        /\/leerlingen$/,
        () =>
          listResponse([
            {
              links: [{ id: 1111, rel: "self", type: "leerling.RLeerling" }],
            },
            {
              links: [{ id: 2222, rel: "self", type: "leerling.RLeerling" }],
            },
          ]),
      ],
      [/\/vakanties\/leerling\/1111/, () => listResponse([])],
      [/\/vakanties\/leerling\/2222/, () => listResponse([kerstvakantie2026])],
      [/\/vakanties\/verzorger/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await scheduleTool(ctx, {
        from: "2026-12-21",
        to: "2026-12-28",
        leerlingId: "1111",
      }),
    ) as {
      vakanties: unknown[];
      vakantiesStatus: string;
      vakantiesAttempts: Array<{ itemCount: number }>;
    };
    expect(out.vakantiesStatus).toBe("empty");
    expect(out.vakanties).toEqual([]);
    expect(
      calls.some((call) =>
        call.url.pathname.includes("/vakanties/leerling/2222"),
      ),
    ).toBe(false);
    expect(out.vakantiesAttempts.every((a) => a.itemCount === 0)).toBe(true);
  });
});
