import { describe, expect, it } from "vitest";
import { absenceTool } from "../../src/tools/absence.js";
import {
  accountMe,
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";

describe("absence", () => {
  it("returns counts and entries per category plus active measures", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/leerlingen\/4242\/registratieOverzicht\?periode=SCHOOLJAAR/,
        () =>
          jsonResponse(200, {
            $type: "participatie.registraties.RLeerlingRegistraties",
            afwezigWaarnemingen: [],
            geoorloofdAfwezig: [
              {
                registratieId: 1,
                registratieSoort: "Ziek",
                begin: "2026-10-01T06:00:00Z",
                eind: "2026-10-01T15:00:00Z",
                geoorloofd: true,
                afgehandeld: true,
                afspraken: [],
              },
            ],
            teLaat: [
              {
                registratieId: 2,
                registratieSoort: "Te laat",
                begin: "2026-10-05T07:35:00Z",
                omschrijving: "<p>Bus</p>",
                geoorloofd: false,
                afgehandeld: false,
                afspraak: {
                  beginDatumTijd: "2026-10-05T07:30:00Z",
                  beginLesuur: 1,
                  vak: { naam: "Engels" },
                },
                afspraken: [],
              },
            ],
          }),
      ],
      [
        /\/maatregeltoekenningen\/actief\/4242/,
        () =>
          listResponse([
            {
              links: [{ id: 3, rel: "self" }],
              maatregelDatum: "2026-10-06",
              maatregel: { omschrijving: "Melden om 8:00" },
              nagekomen: false,
              automatischToegekend: true,
            },
          ]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await absenceTool(ctx, {})) as Record<
      string,
      Record<string, unknown>
    >;
    expect(out.aantallen).toMatchObject({
      geoorloofdAfwezig: 1,
      teLaat: 1,
      ongeoorloofdAfwezig: 0,
      afwezigWaarnemingen: 0,
    });
    expect(out.registraties!.teLaat).toEqual([
      {
        id: 2,
        soort: "Te laat",
        begin: "2026-10-05T07:35:00Z",
        omschrijving: "Bus",
        geoorloofd: false,
        afgehandeld: false,
        lessen: [{ begin: "2026-10-05T07:30:00Z", lesuur: 1, vak: "Engels" }],
      },
    ]);
    expect(out.actieveMaatregelen).toEqual([
      {
        id: 3,
        datum: "2026-10-06",
        maatregel: "Melden om 8:00",
        nagekomen: false,
        automatisch: true,
      },
    ]);
    expect(calls.every((call) => call.init?.method === "GET")).toBe(true);
  });

  it("respects the absence switches", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242, { absentiesBekijkenAan: false })],
    ]);
    const ctx = await toolContext(fetchFn);
    expect(toolJson(await absenceTool(ctx, {})).available).toBe(false);
    expect(calls).toHaveLength(1);

    const second = routedFetch([
      [
        /\/account\/me/,
        () => accountMe(4242, { absentieMaatregelBekijkenAan: false }),
      ],
      [
        /registratieOverzicht\?periode=CIJFERPERIODE/,
        () => jsonResponse(200, {}),
      ],
    ]);
    const ctx2 = await toolContext(second.fetchFn);
    const out = toolJson(await absenceTool(ctx2, { periode: "CIJFERPERIODE" }));
    expect(out.actieveMaatregelen).toMatchObject({ available: false });
    expect(second.calls).toHaveLength(2);
  });
});
