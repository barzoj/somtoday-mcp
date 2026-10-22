import { describe, expect, it } from "vitest";
import { ACCEPT_JSON } from "../../src/constants.js";
import {
  consentsTool,
  parentEveningTool,
  signingDocumentTool,
  signingRequestsTool,
} from "../../src/tools/misc.js";
import {
  jsonResponse,
  listResponse,
  minimalPdf,
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
              status: "OPENSTAAND",
              toelichting: "<p>Graag tekenen</p>",
            },
            { id: "a1b2-c3", titel: "Schoolreis", status: "ONDERTEKEND" },
          ]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await signingRequestsTool(ctx));
    expect(out.ondertekenverzoeken).toEqual([
      {
        id: 1,
        titel: "Toestemming excursie",
        status: "OPENSTAAND",
        toelichting: "Graag tekenen",
        document: { tool: "signing_document", id: 1, available: false },
      },
      {
        id: "a1b2-c3",
        titel: "Schoolreis",
        status: "ONDERTEKEND",
        document: { tool: "signing_document", id: "a1b2-c3", available: true },
      },
    ]);
    expect(calls[0]?.headers.get("accept")).toBe(ACCEPT_JSON);
    expect(calls[0]?.init?.method).toBe("GET");
  });
});

describe("signing_document", () => {
  it("downloads the PDF with the login token and extracts text", async () => {
    const { fetchFn, calls } = routedFetch([
      [
        /\/begeleiden\/ondertekenverzoeken\/77\/document$/,
        () =>
          new Response(minimalPdf("Ondertekend formulier"), {
            status: 200,
            headers: { "content-type": "application/pdf" },
          }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await signingDocumentTool(ctx, { id: "77" }));
    expect(out).toMatchObject({
      id: "77",
      contentType: "application/pdf",
      fileName: "ondertekenverzoek-77.pdf",
      pages: 1,
    });
    expect(String(out.text)).toContain("Ondertekend formulier");
    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[0]?.headers.get("accept")).toBe("application/pdf");
    expect(calls[0]?.headers.get("authorization")).toMatch(/^Bearer /);
  });

  it("uses the server's file name when given", async () => {
    const { fetchFn } = routedFetch([
      [
        /\/document$/,
        () =>
          new Response(minimalPdf("x"), {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-disposition": 'attachment; filename="toestemming.pdf"',
            },
          }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await signingDocumentTool(ctx, { id: "5" }));
    expect(out.fileName).toBe("toestemming.pdf");
  });

  it("reports a missing document as not available", async () => {
    const { fetchFn } = routedFetch([
      [/\/document$/, () => new Response("", { status: 404 })],
    ]);
    const ctx = await toolContext(fetchFn);
    expect(toolJson(await signingDocumentTool(ctx, { id: "9" }))).toMatchObject(
      { available: false, status: 404 },
    );
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
