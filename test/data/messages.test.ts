import { describe, expect, it } from "vitest";
import { messagesTool } from "../../src/tools/messages.js";
import {
  accountMe,
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";

const boodschap = (
  id: number,
  date: string,
  extra: Record<string, unknown> = {},
) => ({
  $type: "berichten.RBoodschap",
  links: [{ id, rel: "self" }],
  verzendDatum: date,
  onderwerp: `Onderwerp ${id}`,
  inhoud: "<p>Beste ouder,<br>Morgen <b>excursie</b>.</p>",
  bijlages: [],
  additionalObjects: {
    verzondenDoorGebruiker: false,
    verzenderCorrespondent: { naam: "Mentor B", initialen: "MB" },
    ontvangerCorrespondenten: { items: [{ naam: "Ouder" }] },
    aantalExtraOntvangers: 0,
    actiefVoorGebruiker: true,
    ...extra,
  },
});

const conversations = () =>
  listResponse([
    {
      boodschappen: [
        boodschap(12, "2026-10-19T10:00:00Z", {
          verzondenDoorGebruiker: true,
          verzenderCorrespondent: { naam: "Ik" },
          aantalExtraOntvangers: 2,
        }),
        boodschap(11, "2026-10-18T10:00:00Z"),
      ],
      datumOudsteOngelezenBoodschap: "2026-10-18T10:00:00Z",
    },
    {
      boodschappen: [
        boodschap(20, "2026-10-10T10:00:00Z", {
          verzenderCorrespondent: undefined,
          isOuderavondUitnodiging: true,
        }),
      ],
    },
  ]);

function server() {
  return routedFetch([
    [/\/account\/me/, () => accountMe(4242)],
    [
      /\/boodschappen\/conversaties\/ongelezencount/,
      () => jsonResponse(200, { $type: "wrappers.LongWrapper", values: [1] }),
    ],
    [/\/boodschappen\/conversaties\?/, conversations],
    [
      /\/boodschappen\/conversatie\/12\/extraOntvangers/,
      () => listResponse([{ naam: "Docent C" }, { naam: "Docent D" }]),
    ],
  ]);
}

describe("messages", () => {
  it("lists conversations with unread state and preview, GET only", async () => {
    const { fetchFn, calls } = server();
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await messagesTool(ctx, {})) as {
      ongelezenConversaties: number;
      conversaties: Array<Record<string, unknown>>;
    };
    expect(out.ongelezenConversaties).toBe(1);
    expect(out.conversaties).toEqual([
      {
        id: 11,
        onderwerp: "Onderwerp 11",
        laatsteBericht: "2026-10-19T10:00:00Z",
        van: "Ik",
        doorJou: true,
        aantalBerichten: 2,
        ongelezen: true,
        voorbeeld: "Beste ouder,\nMorgen excursie.",
      },
      {
        id: 20,
        onderwerp: "Onderwerp 20",
        laatsteBericht: "2026-10-10T10:00:00Z",
        van: "Automatisch bericht",
        doorJou: false,
        aantalBerichten: 1,
        ongelezen: false,
        ouderavondUitnodiging: true,
        voorbeeld: "Beste ouder,\nMorgen excursie.",
      },
    ]);
    const list = calls.find((call) =>
      call.url.pathname.endsWith("/conversaties"),
    )!;
    expect(list.url.searchParams.get("alle")).toBe("true");
    expect(list.url.searchParams.getAll("additional")).toHaveLength(5);
    expect(calls.every((call) => call.init?.method === "GET")).toBe(true);
    expect(
      calls.some((call) =>
        /markeerGelezen|setGelezen|verwijder/.test(call.url.pathname),
      ),
    ).toBe(false);
  });

  it("filters on unread and search text", async () => {
    const { fetchFn } = server();
    const ctx = await toolContext(fetchFn);
    const unread = toolJson(await messagesTool(ctx, { ongelezen: true })) as {
      conversaties: unknown[];
    };
    expect(unread.conversaties).toHaveLength(1);
    const search = toolJson(
      await messagesTool(ctx, { zoek: "automatisch" }),
    ) as { conversaties: Array<{ id: number }> };
    expect(search.conversaties.map((item) => item.id)).toEqual([20]);
  });

  it("reads one thread oldest-first with extra recipients", async () => {
    const { fetchFn, calls } = server();
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await messagesTool(ctx, { conversatieId: "11" })) as {
      berichten: Array<Record<string, unknown>>;
    };
    expect(out.berichten.map((bericht) => bericht.id)).toEqual([11, 12]);
    expect(out.berichten[0]).toMatchObject({
      van: "Mentor B",
      aan: ["Ouder"],
      inhoud: "Beste ouder,\nMorgen excursie.",
    });
    expect(out.berichten[1]!.aan).toEqual(["Ouder", "Docent C", "Docent D"]);
    expect(calls.every((call) => call.init?.method === "GET")).toBe(true);
  });

  it("respects berichtenBekijkenAan", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242, { berichtenBekijkenAan: false })],
    ]);
    const ctx = await toolContext(fetchFn);
    expect(toolJson(await messagesTool(ctx, {})).available).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
