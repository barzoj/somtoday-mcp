import { describe, expect, it } from "vitest";
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

  it("refuses ranges over 42 days", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
    ]);
    const ctx = await toolContext(fetchFn);
    const result = await homeworkTool(ctx, {
      from: "2026-09-01",
      to: "2026-12-31",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/at most 42/);
  });
});
