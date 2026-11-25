import { describe, expect, it } from "vitest";
import { gradesLatestTool } from "../../src/tools/grades-latest.js";
import { result } from "../fixtures/resultaat.js";
import {
  accountMe,
  jsonResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";

describe("grades_latest", () => {
  it("pages up to limit and maps every field", async () => {
    const all = Array.from({ length: 140 }, (_, n) => result(n));
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/geldendvoortgangsdossierresultaten\/leerling\/4242/,
        (_url, init) => {
          const [, a, b] = /items=(\d+)-(\d+)/.exec(
            new Headers(init?.headers).get("range")!,
          )!;
          const items = all.slice(Number(a), Number(b) + 1);
          return jsonResponse(
            206,
            { items },
            {
              "content-range": `items ${a}-${Number(a) + items.length - 1}/140`,
            },
          );
        },
      ],
      [
        /resultaatpublicatiemomenten\/volgende\/leerling\/4242/,
        () => jsonResponse(200, { $type: "x", value: null }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await gradesLatestTool(ctx, { limit: 120 })) as {
      total: number;
      shown: number;
      items: Array<Record<string, unknown>>;
      volgendePublicatie: unknown;
    };
    expect(out.total).toBe(140);
    expect(out.shown).toBe(120);
    expect(out.volgendePublicatie).toBeNull();
    expect(out.items[0]).toEqual({
      id: 1000,
      vak: "Wiskunde",
      vakUuid: "vak-uuid",
      lichtingUuid: "lichting-uuid",
      kolom: "P1-T1",
      omschrijving: "Toets 0",
      resultaat: "7,5",
      cijfer: 7.5,
      voldoende: true,
      weging: 2,
      type: "Toetskolom",
      toetssoort: "SO",
      toetscode: "T1",
      periode: 1,
      datum: "2026-10-01T10:00:00Z",
      opmerkingen: "Goed",
      herkansing: {
        soort: "EenKeerHoogste",
        geldendPoging: 1,
        eerstePoging: "5,0",
        herkansing1: "7,5",
        datumEerstePoging: "2026-10-01T10:00:00Z",
        datumHerkansing1: "2026-10-15T10:00:00Z",
        voldoendeEerstePoging: false,
        voldoendeHerkansing1: true,
        pogingen: [
          {
            poging: 0,
            omschrijving: "Eerste poging",
            resultaat: "5,0",
            datum: "2026-10-01T10:00:00Z",
            voldoende: false,
          },
          {
            poging: 1,
            omschrijving: "Herkansing",
            resultaat: "7,5",
            datum: "2026-10-15T10:00:00Z",
            voldoende: true,
          },
        ],
      },
      volgnummer: 0,
    });
    const ranges = calls
      .filter((call) => call.url.pathname.includes("dossierresultaten"))
      .map((call) => call.headers.get("range"));
    expect(ranges).toEqual(["items=0-99", "items=100-119"]);
    const query = calls.find((call) =>
      call.url.pathname.includes("dossierresultaten"),
    )!.url.searchParams;
    expect(query.getAll("type")).toHaveLength(4);
    expect(query.get("sort")).toBe("desc-geldendResultaatCijferInvoer");
  });

  it("uses the exam dossier when asked", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/geldendexamendossierresultaten\/leerling\/4242/,
        () =>
          jsonResponse(206, { items: [] }, { "content-range": "items 0-0/0" }),
      ],
      [/resultaatpublicatiemomenten/, () => jsonResponse(403, { m: "x" })],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await gradesLatestTool(ctx, { dossier: "examen" }));
    expect(out).toMatchObject({ dossier: "examen", shown: 0 });
    expect(
      calls.some((call) => call.url.pathname.includes("examendossier")),
    ).toBe(true);
  });
});
