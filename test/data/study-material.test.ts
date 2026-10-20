import { describe, expect, it } from "vitest";
import { studyMaterialTool } from "../../src/tools/study-material.js";
import {
  accountMe,
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";
import { LEERLING, toekenning } from "../fixtures/studiewijzer.js";

const WI = "00000000-0000-4000-8000-0000000000b1";
const NE = "00000000-0000-4000-8000-0000000000b2";

const subjects = () =>
  listResponse([
    {
      $type: "onderwijsinrichting.RVak",
      UUID: NE,
      afkorting: "ne",
      naam: "Nederlands",
    },
    {
      $type: "onderwijsinrichting.RVak",
      UUID: WI,
      afkorting: "wi",
      naam: "Wiskunde",
    },
  ]);

const material = () =>
  jsonResponse(200, {
    lesstof: [
      toekenning(
        "Dag",
        12,
        { datumTijd: "2026-10-23T08:00:00Z" },
        { huiswerkType: "LESSTOF", onderwerp: "H3 kwadraten" },
      ),
      toekenning(
        "Afspraak",
        11,
        { datumTijd: "2026-10-21T08:00:00Z" },
        { huiswerkType: "LESSTOF", onderwerp: "H3 intro" },
      ),
      { $type: "studiewijzer.RSWIDagToekenning" },
    ],
    jaarBijlagenMappen: [
      { naam: "Samenvattingen", sortering: 2 },
      { naam: "Oefentoetsen", sortering: 1 },
    ],
    jaarBijlagen: [
      {
        omschrijving: "Oefentoets H3",
        jaarbijlageMap: { naam: "Oefentoetsen" },
        assemblyResults: [
          {
            assemblyFileType: "DOCUMENT",
            fileName: "oefentoets.pdf",
            fileUrl: "https://files.example.test/oefentoets.pdf",
            fileSize: 99,
            fileExtension: "pdf",
          },
        ],
      },
    ],
    externMateriaal: [
      {
        uri: "https://video.example.test/x",
        omschrijving: "Uitlegvideo",
        jaarbijlageMap: { naam: "Samenvattingen" },
      },
    ],
    leermiddelKeuzes: [
      {
        UUID: "lk",
        leermiddel: {
          titel: "Getal & Ruimte",
          url: "https://publisher.example.test/gr",
          methode: { naam: "G&R", uitgevernaam: "Uitgever X" },
        },
      },
    ],
  });

describe("study_material", () => {
  it("lists subjects and personal products without arguments", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
      [/\/vakken\/studiemateriaal\/4242/, subjects],
      [
        /\/studiemateriaal\/algemeen\/4242/,
        () => jsonResponse(403, { message: "verzorger" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await studyMaterialTool(ctx, {}));
    expect(out.vakkenMetStudiemateriaal).toEqual([
      { naam: "Nederlands", afkorting: "ne", uuid: NE },
      { naam: "Wiskunde", afkorting: "wi", uuid: WI },
    ]);
    expect(out.persoonlijkeLeermiddelen).toMatchObject({
      available: false,
      status: 403,
    });
  });

  it("returns lesson material by date, attachments by folder, links and methods for one subject", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
      [/\/vakken\/studiemateriaal\/4242/, subjects],
      [new RegExp(`/studiemateriaal/4242/vak/${WI}$`), material],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await studyMaterialTool(ctx, { vak: "wisk" })) as {
      vakken: Array<
        Record<string, unknown> & { lesstof: Array<Record<string, unknown>> }
      >;
    };
    const wi = out.vakken[0]!;
    expect(wi.vak).toEqual({ naam: "Wiskunde", afkorting: "wi", uuid: WI });
    expect(
      wi.lesstof.map((item) => [item.datum, item.onderwerp, item.huiswerkType]),
    ).toEqual([
      ["2026-10-21", "H3 intro", "LESSTOF"],
      ["2026-10-23", "H3 kwadraten", "LESSTOF"],
    ]);
    expect(wi.lesstof[0]).toMatchObject({
      leerdoelen: "Kwadratische vergelijkingen",
      bijlagen: [{ fileUrl: "https://files.example.test/werkblad.pdf" }],
    });
    expect(wi.mappen).toEqual(["Oefentoetsen", "Samenvattingen"]);
    expect(wi.jaarBijlagen).toEqual([
      {
        naam: "Oefentoets H3",
        fileName: "oefentoets.pdf",
        fileUrl: "https://files.example.test/oefentoets.pdf",
        fileSize: 99,
        fileExtension: "pdf",
        type: "DOCUMENT",
        map: "Oefentoetsen",
      },
    ]);
    expect(wi.externMateriaal).toEqual([
      {
        omschrijving: "Uitlegvideo",
        uri: "https://video.example.test/x",
        map: "Samenvattingen",
      },
    ]);
    expect(wi.leermiddelen).toEqual([
      {
        titel: "Getal & Ruimte",
        url: "https://publisher.example.test/gr",
        methode: "G&R",
        uitgever: "Uitgever X",
        soort: "boekenfonds",
      },
    ]);
    // Opening material is never registered (no swgebruik PUT), and only GETs are sent.
    expect(calls.every((call) => call.init?.method === "GET")).toBe(true);
    expect(calls.some((call) => call.url.pathname.includes("swgebruik"))).toBe(
      false,
    );
  });

  it("fetches every subject with all=true and marks failing ones", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
      [/\/vakken\/studiemateriaal\/4242/, subjects],
      [
        /\/studiemateriaal\/algemeen/,
        () =>
          listResponse([
            {
              UUID: "u",
              product: {
                title: "Digitaal boek",
                url: "https://p.example.test",
                methodeInformatie: { methode: "M", uitgever: "U" },
              },
            },
          ]),
      ],
      [new RegExp(`/studiemateriaal/4242/vak/${WI}$`), material],
      [
        new RegExp(`/studiemateriaal/4242/vak/${NE}$`),
        () => jsonResponse(403, { m: "x" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await studyMaterialTool(ctx, { all: true })) as {
      vakken: Array<Record<string, unknown>>;
      persoonlijkeLeermiddelen: unknown[];
    };
    expect(out.vakken).toHaveLength(2);
    expect(out.vakken[0]).toMatchObject({
      vak: { afkorting: "ne" },
      available: false,
    });
    expect(out.vakken[1]).toMatchObject({ vak: { afkorting: "wi" } });
    expect(out.persoonlijkeLeermiddelen).toEqual([
      {
        titel: "Digitaal boek",
        url: "https://p.example.test",
        methode: "M",
        uitgever: "U",
        soort: "persoonlijk",
      },
    ]);
  });

  it("explains which subjects exist when vak does not match", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
      [/\/vakken\/studiemateriaal\/4242/, subjects],
    ]);
    const ctx = await toolContext(fetchFn);
    const result = await studyMaterialTool(ctx, { vak: "Latijn" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(
      /Nederlands \(ne\), Wiskunde \(wi\)/,
    );
  });
});
