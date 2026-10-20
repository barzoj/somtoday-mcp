import { describe, expect, it } from "vitest";
import { ACCEPT_JSON } from "../../src/constants.js";
import {
  consentsTool,
  parentEveningTool,
  signingRequestsTool,
} from "../../src/tools/misc.js";
import {
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";

describe("signing_requests", () => {
  it("reads the plain-JSON list", async () => {
    const { fetchFn, calls } = routedFetch([
      [
        /\/begeleiden\/ondertekenverzoeken/,
        () =>
          jsonResponse(200, [
            {
              id: 1,
              titel: "Toestemming excursie",
              status: "OPEN",
              omschrijving: "<p>Graag tekenen</p>",
            },
          ]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await signingRequestsTool(ctx));
    expect(out.ondertekenverzoeken).toEqual([
      {
        id: 1,
        titel: "Toestemming excursie",
        status: "OPEN",
        omschrijving: "Graag tekenen",
      },
    ]);
    expect(calls[0]?.headers.get("accept")).toBe(ACCEPT_JSON);
    expect(calls[0]?.init?.method).toBe("GET");
  });
});

describe("consents", () => {
  it("lists toestemmingen", async () => {
    const { fetchFn } = routedFetch([
      [
        /\/leerlingen\/toestemmingen/,
        () =>
          listResponse([
            {
              $type: "x",
              links: [{ id: 3, rel: "self" }],
              omschrijving: "Foto's op website",
              waarde: true,
            },
          ]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    expect(toolJson(await consentsTool(ctx)).toestemmingen).toEqual([
      { id: 3, omschrijving: "Foto's op website", waarde: true },
    ]);
  });
});

describe("parent_evening", () => {
  it("finds invitation links in messages and loads them", async () => {
    const { fetchFn, calls } = routedFetch([
      [
        /\/boodschappen\/conversaties/,
        () =>
          listResponse([
            {
              boodschappen: [
                {
                  inhoud:
                    '<a href="https://leerling.somtoday.nl/ouderavond/abc-123">Inschrijven</a>',
                  additionalObjects: { isOuderavondUitnodiging: true },
                },
              ],
            },
            {
              boodschappen: [
                { inhoud: "<p>Gewoon bericht</p>", additionalObjects: {} },
              ],
            },
          ]),
      ],
      [
        /\/ouderavond\/abc-123$/,
        () =>
          jsonResponse(200, {
            $type: "x",
            naam: "Ouderavond leerjaar 2",
            datum: "2026-11-12",
          }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await parentEveningTool(ctx, {}));
    expect(out.ouderavonden).toEqual([
      { id: "abc-123", naam: "Ouderavond leerjaar 2", datum: "2026-11-12" },
    ]);
    expect(calls.every((call) => call.init?.method === "GET")).toBe(true);
  });

  it("explains when there is no invitation", async () => {
    const { fetchFn } = routedFetch([
      [/\/boodschappen\/conversaties/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await parentEveningTool(ctx, {}));
    expect(out.ouderavonden).toEqual([]);
    expect(out.hint).toMatch(/No parent-evening/);
  });
});
