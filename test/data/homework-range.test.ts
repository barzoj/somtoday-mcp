import { describe, expect, it } from "vitest";
import { homeworkItemKey } from "../../src/api/homework.js";
import { homeworkTool } from "../../src/tools/homework.js";
import {
  accountMe,
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";
import { LEERLING, handIn, toekenning } from "../fixtures/studiewijzer.js";

function server() {
  return routedFetch([
    [/\/account\/me/, () => accountMe(LEERLING)],
    [
      /studiewijzeritemafspraaktoekenningen.*jaarWeek=2026%7E43/,
      () =>
        listResponse([
          toekenning("Afspraak", 1, { datumTijd: "2026-10-20T07:30:00Z" }),
        ]),
    ],
    [/studiewijzeritemafspraaktoekenningen/, () => listResponse([])],
    [
      /studiewijzeritemdagtoekenningen.*heeftInleverperiode=true/,
      () =>
        listResponse([
          handIn(
            5,
            "2026-10-14T06:00:00Z",
            "2026-10-21T21:59:00Z",
            "TE_BEOORDELEN",
          ),
          handIn(6, "2026-11-01T06:00:00Z", "2026-11-10T21:59:00Z"),
        ]),
    ],
    [
      /studiewijzeritemdagtoekenningen.*jaarWeek=2026%7E43/,
      () =>
        listResponse([
          toekenning(
            "Dag",
            2,
            { datumTijd: "2026-10-21T22:30:00Z" },
            { huiswerkType: "TOETS", toetsSoort: { naam: "Schriftelijk" } },
          ),
        ]),
    ],
    [/studiewijzeritemdagtoekenningen/, () => listResponse([])],
    [
      /studiewijzeritemweektoekenningen.*weeknummer=43/,
      () =>
        listResponse([
          toekenning("Week", 3, { weeknummerVanaf: 43, weeknummerTm: 44 }),
          toekenning("Week", 4, { weeknummerVanaf: 40, weeknummerTm: 41 }),
        ]),
    ],
    [/studiewijzeritemweektoekenningen/, () => listResponse([])],
  ]);
}

describe("homeworkItemKey", () => {
  it("keys by soort and toekenningId, with fallbacks when either is missing", () => {
    expect(homeworkItemKey({ soort: "dag", toekenningId: 7 })).toBe("dag:7");
    expect(homeworkItemKey({ toekenningId: 7 })).toBe("unknown:7");
    expect(homeworkItemKey({ soort: "les" })).toBe("anon:les");
    expect(homeworkItemKey({})).toBe("anon:unknown");
  });
});

describe("homework (date range)", () => {
  it("groups every item by day with all fields, plus week items and deadlines", async () => {
    const { fetchFn, calls } = server();
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await homeworkTool(ctx, { from: "2026-10-20", to: "2026-10-22" }),
    ) as {
      leerlingId: number;
      days: Array<{
        datum: string;
        items: Array<Record<string, unknown>>;
        deadlines: Array<Record<string, unknown>>;
      }>;
      weken: Array<{ week: number; items: Array<Record<string, unknown>> }>;
    };

    expect(out.leerlingId).toBe(LEERLING);
    expect(out.days.map((day) => day.datum)).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
    ]);
    const lesson = out.days[0]!.items[0]!;
    expect(lesson).toMatchObject({
      toekenningId: 1,
      soort: "les",
      vak: "Wiskunde",
      vakAfkorting: "wi",
      huiswerkType: "HUISWERK",
      onderwerp: "Item 1",
      omschrijving: "Lees paragraaf 3.2",
      leerdoelen: "Kwadratische vergelijkingen",
      tijdsindicatie: "30 minuten",
      notitie: "Neem je rekenmachine mee",
      gemaakt: true,
      studiewijzerId: 900,
    });
    expect(lesson.bijlagen).toEqual([
      {
        id: 7001,
        naam: "Werkblad",
        fileName: "werkblad.pdf",
        fileUrl: "https://files.example.test/werkblad.pdf",
        fileSize: 1234,
        fileExtension: "pdf",
        type: "DOCUMENT",
      },
    ]);
    expect(lesson.externeMaterialen).toEqual([
      { omschrijving: "Methode H3", uri: "https://method.example.test/h3" },
    ]);

    // 22:30Z on the 21st is the 22nd in Amsterdam.
    expect(out.days[2]!.items[0]).toMatchObject({
      soort: "dag",
      huiswerkType: "TOETS",
      toetsSoort: "Schriftelijk",
    });
    expect(out.days[1]!.deadlines).toHaveLength(1);
    expect(out.days[1]!.deadlines[0]).toMatchObject({
      onderwerp: "Opdracht 5",
      inleverStatus: "TE_BEOORDELEN",
      inlevermoment: { inleveringenVerwacht: 1 },
    });
    expect(out.weken).toHaveLength(1);
    expect(out.weken[0]!.items.map((item) => item.toekenningId)).toEqual([3]);

    // Every list is paged and the client only sends GET.
    for (const call of calls) {
      expect(call.init?.method).toBe("GET");
      if (!call.url.pathname.includes("account")) {
        expect(call.headers.get("range")).toBe("items=0-99");
      }
    }
  });

  it("hides the teacher note when it is not meant for the student", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
      [
        /studiewijzeritemdagtoekenningen.*jaarWeek/,
        () =>
          listResponse([
            toekenning(
              "Dag",
              9,
              { datumTijd: "2026-10-20T08:00:00Z" },
              { notitieZichtbaarVoorLeerling: false, notitie: "intern" },
            ),
          ]),
      ],
      [/toekenningen/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await homeworkTool(ctx, { date: "2026-10-20" })) as {
      days: Array<{ items: Array<Record<string, unknown>> }>;
    };
    expect(out.days[0]!.items[0]!.notitie).toBeUndefined();
  });

  it("reports a section switched off by the school without calling the planner", async () => {
    const { fetchFn, calls } = routedFetch([
      [
        /\/account\/me/,
        () => accountMe(LEERLING, { huiswerkBekijkenAan: false }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await homeworkTool(ctx, {}));
    expect(out.available).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("returns available:false when the planner answers 403 with a body", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
      [
        /toekenningen/,
        () => jsonResponse(403, { message: "geen studiewijzer" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await homeworkTool(ctx, { date: "2026-10-20" }));
    expect(out).toMatchObject({ available: false, status: 403 });
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
      [/\/account\/me/, () => accountMe(LEERLING)],
      [/heeftInleverperiode=true/, () => listResponse([])],
      [/toekenningen/, slowEmpty],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await homeworkTool(ctx, { from: "2026-09-01", to: "2026-12-31" }),
    ) as { days: unknown[] };
    expect(out.days).toHaveLength(122);
    const weekCalls = calls.filter((call) =>
      /jaarWeek=|weeknummer=/.test(call.url.search),
    );
    // 18 ISO weeks (36 to 53) x 3 list calls
    expect(weekCalls).toHaveLength(18 * 3);
    expect(maxInFlight).toBeLessThanOrEqual(6 * 3);
  });

  it("merges a 120-day range across week windows: all items, no duplicates, sorted by date", async () => {
    // 2026-01-05 (Mon, ISO 2026~2) .. 2026-05-04 (Mon, ISO 2026~19) = 120 days.
    // Boundary items on the first and last day; the same toekenning is also
    // returned from an adjacent week so the merge must dedupe by id.
    const firstDay = "2026-01-05";
    const lastDay = "2026-05-04";
    const midDay = "2026-03-04"; // Wednesday of ISO week 10
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
      [/heeftInleverperiode=true/, () => listResponse([])],
      [
        /studiewijzeritemdagtoekenningen.*jaarWeek=2026%7E2/,
        () =>
          listResponse([
            toekenning("Dag", 101, {
              datumTijd: "2026-01-05T08:00:00Z",
            }),
            // Same id also appears in week 3 below — must appear once.
            toekenning("Dag", 102, {
              datumTijd: "2026-01-05T10:00:00Z",
            }),
          ]),
      ],
      [
        /studiewijzeritemdagtoekenningen.*jaarWeek=2026%7E3/,
        () =>
          listResponse([
            toekenning("Dag", 102, {
              datumTijd: "2026-01-05T10:00:00Z",
            }),
          ]),
      ],
      [
        /studiewijzeritemdagtoekenningen.*jaarWeek=2026%7E10/,
        () =>
          listResponse([
            toekenning("Dag", 110, {
              datumTijd: "2026-03-04T09:00:00Z",
            }),
          ]),
      ],
      [
        /studiewijzeritemdagtoekenningen.*jaarWeek=2026%7E19/,
        () =>
          listResponse([
            toekenning("Dag", 119, {
              datumTijd: "2026-05-04T08:00:00Z",
            }),
          ]),
      ],
      [/studiewijzeritemdagtoekenningen/, () => listResponse([])],
      [/studiewijzeritemafspraaktoekenningen/, () => listResponse([])],
      [/studiewijzeritemweektoekenningen/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await homeworkTool(ctx, { from: firstDay, to: lastDay }),
    ) as {
      from: string;
      to: string;
      days: Array<{
        datum: string;
        items: Array<{ toekenningId?: number; datum?: string }>;
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
    expect(allItems.map((item) => item.toekenningId).toSorted()).toEqual([
      101, 102, 110, 119,
    ]);
    expect(out.days[0]!.items.map((item) => item.toekenningId)).toEqual([
      101, 102,
    ]);
    const mid = out.days.find((day) => day.datum === midDay);
    expect(mid!.items.map((item) => item.toekenningId)).toEqual([110]);
    expect(out.days[119]!.items.map((item) => item.toekenningId)).toEqual([
      119,
    ]);

    // Every ISO week in the span was queried (18 weeks × 3 list endpoints).
    const weekCalls = calls.filter((call) =>
      /jaarWeek=|weeknummer=/.test(call.url.search),
    );
    expect(weekCalls).toHaveLength(18 * 3);
  });

  it("refuses ranges over 350 days", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
    ]);
    const ctx = await toolContext(fetchFn);
    const result = await homeworkTool(ctx, {
      from: "2026-08-01",
      to: "2027-07-31",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/at most 350/);
  });
});
