import { describe, expect, it } from "vitest";
import {
  hasHerkansing,
  isNietGemaakt,
  mapHerkansing,
  mapPogingen,
  mapResult,
  type RawResult,
} from "../../src/api/results.js";
import {
  pickRetakes,
  RETAKES_LIMITATIONS,
  retakesTool,
} from "../../src/tools/retakes.js";
import { result } from "../fixtures/resultaat.js";
import {
  accountMe,
  jsonResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";

describe("mapHerkansing / mapPogingen", () => {
  it("builds pogingen for first attempt and both retakes", () => {
    const raw: RawResult = {
      herkansing: "TweeKeerHoogste",
      herkansingsnummer: 2,
      formattedEerstePoging: "4,0",
      formattedHerkansing1: "6,0",
      formattedHerkansing2: "7,5",
      datumInvoerEerstePoging: "2026-01-10T09:00:00Z",
      datumInvoerHerkansing1: "2026-02-10T09:00:00Z",
      datumInvoerHerkansing2: "2026-03-10T09:00:00Z",
      isVoldoendeEerstePoging: false,
      isVoldoendeHerkansing1: true,
      isVoldoendeHerkansing2: true,
      opmerkingenHerkansing2: "Laatste kans",
    };
    expect(mapPogingen(raw)).toEqual([
      {
        poging: 0,
        omschrijving: "Eerste poging",
        resultaat: "4,0",
        datum: "2026-01-10T09:00:00Z",
        voldoende: false,
      },
      {
        poging: 1,
        omschrijving: "Herkansing",
        resultaat: "6,0",
        datum: "2026-02-10T09:00:00Z",
        voldoende: true,
      },
      {
        poging: 2,
        omschrijving: "Tweede herkansing",
        resultaat: "7,5",
        datum: "2026-03-10T09:00:00Z",
        voldoende: true,
        opmerkingen: "Laatste kans",
      },
    ]);
    expect(mapHerkansing(raw)).toMatchObject({
      soort: "TweeKeerHoogste",
      geldendPoging: 2,
      herkansing2: "7,5",
      datumHerkansing2: "2026-03-10T09:00:00Z",
    });
  });

  it("omits herkansing when soort is Geen or missing", () => {
    expect(mapHerkansing({ herkansing: "Geen" })).toBeUndefined();
    expect(mapHerkansing({})).toBeUndefined();
  });

  it("keeps an attempt that only has a remark", () => {
    expect(
      mapPogingen({
        herkansing: "EenKeerHoogste",
        opmerkingenHerkansing1: "Nog in te plannen",
      }),
    ).toEqual([
      {
        poging: 1,
        omschrijving: "Herkansing",
        opmerkingen: "Nog in te plannen",
      },
    ]);
  });
});

describe("pickRetakes", () => {
  it("splits retake columns from missed tests without a retake policy", () => {
    const asRaw = (value: unknown) => value as RawResult;
    const withRetake = mapResult(asRaw(result(1)));
    const missed = mapResult(
      asRaw(
        result(2, {
          herkansing: "Geen",
          formattedHerkansing1: undefined,
          bijzonderheid: "NietGemaakt",
          formattedResultaat: "*",
        }),
      ),
    );
    const plain = mapResult(
      asRaw(
        result(3, {
          herkansing: "Geen",
          formattedHerkansing1: undefined,
          formattedEerstePoging: "8,0",
        }),
      ),
    );
    expect(hasHerkansing(withRetake)).toBe(true);
    expect(isNietGemaakt(missed)).toBe(true);
    const picked = pickRetakes([withRetake, missed, plain]);
    expect(picked.herkansingen).toEqual([withRetake]);
    expect(picked.nietGemaakt).toEqual([missed]);
  });
});

describe("retakes tool", () => {
  it("returns herkansingen, nietGemaakt and documented limitations", async () => {
    const items = [
      result(1),
      result(2, {
        herkansing: "Geen",
        formattedHerkansing1: undefined,
        bijzonderheid: "NietGemaakt",
        formattedResultaat: "*",
      }),
      result(3, {
        herkansing: "Geen",
        formattedHerkansing1: undefined,
        formattedEerstePoging: "8,0",
        formattedResultaat: "8,0",
      }),
    ];
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/geldendvoortgangsdossierresultaten\/leerling\/4242/,
        () => jsonResponse(206, { items }, { "content-range": "items 0-2/3" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await retakesTool(ctx, { limit: 50 })) as {
      dossier: string;
      scanned: number;
      total: number;
      herkansingen: unknown[];
      nietGemaakt: unknown[];
      limitations: typeof RETAKES_LIMITATIONS;
    };
    expect(out.dossier).toBe("voortgang");
    expect(out.scanned).toBe(3);
    expect(out.total).toBe(3);
    expect(out.herkansingen).toHaveLength(1);
    expect(out.nietGemaakt).toHaveLength(1);
    expect(out.limitations).toEqual(RETAKES_LIMITATIONS);
    expect(
      (out.herkansingen[0] as { herkansing: { pogingen: unknown[] } })
        .herkansing.pogingen,
    ).toHaveLength(2);
    expect(
      calls.some((call) =>
        call.url.pathname.includes("geldendvoortgangsdossierresultaten"),
      ),
    ).toBe(true);
  });

  it("uses the exam dossier when asked", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/geldendexamendossierresultaten\/leerling\/4242/,
        () =>
          jsonResponse(206, { items: [] }, { "content-range": "items 0-0/0" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await retakesTool(ctx, { dossier: "examen" }));
    expect(out).toMatchObject({
      dossier: "examen",
      scanned: 0,
      herkansingen: [],
      nietGemaakt: [],
    });
    expect(
      calls.some((call) => call.url.pathname.includes("examendossier")),
    ).toBe(true);
  });
});
