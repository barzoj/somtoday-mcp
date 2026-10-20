import { describe, expect, it } from "vitest";
import {
  fetchHomeworkSets,
  filterDatedHomework,
  filterWeekHomework,
  handInQuery,
  mapHomework,
} from "../../src/api/homework.js";
import { htmlToPlain } from "../../src/html.js";
import { jaarWeek } from "../../src/dates.js";
import { FAKE_SESSION, jsonResponse, scriptedFetch } from "../helpers.js";
import { ApiClient } from "../../src/api/client.js";
import { MemorySecretStore } from "../../src/auth/memory-store.js";
import { SessionManager } from "../../src/auth/session.js";

describe("homework filters", () => {
  it("keeps a matching datumTijd, drops another day, and keeps a covering week task", () => {
    const ymd = "2026-10-12";
    const { week } = { week: 42 };

    const dated = filterDatedHomework(
      [
        {
          datumTijd: "2026-10-11T22:30:00.000Z",
          studiewijzerItem: { onderwerp: "Keep" },
        },
        {
          datumTijd: "2026-10-12T22:30:00.000Z",
          studiewijzerItem: { onderwerp: "Drop" },
        },
      ],
      ymd,
    );
    expect(dated.map((item) => item.studiewijzerItem?.onderwerp)).toEqual([
      "Keep",
    ]);

    const weeks = filterWeekHomework(
      [
        {
          weeknummerVanaf: 41,
          weeknummerTm: 43,
          studiewijzerItem: { onderwerp: "Week" },
        },
        {
          weeknummerVanaf: 40,
          weeknummerTm: 41,
          studiewijzerItem: { onderwerp: "Other" },
        },
      ],
      ymd,
    );
    expect(jaarWeek(ymd)).toBe("2026~42");
    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.weeknummerVanaf).toBe(41);
    expect(week).toBe(42);
  });

  it("builds the hand-in query without jaarWeek", () => {
    const query = handInQuery(4242);
    expect(query.get("studiewijzerItem.heeftInleverperiode")).toBe("true");
    expect(query.has("jaarWeek")).toBe(false);
    expect(query.get("geenDifferentiatieOfGedifferentieerdVoorLeerling")).toBe(
      "4242",
    );
  });

  it("requests the day-task URL for hand-ins", async () => {
    const { fetchFn, calls } = scriptedFetch([
      async () => jsonResponse(206, { items: [] }),
      async () => jsonResponse(206, { items: [] }),
      async () => jsonResponse(206, { items: [] }),
      async () => jsonResponse(206, { items: [] }),
    ]);
    const store = new MemorySecretStore();
    await store.save(FAKE_SESSION);
    const session = new SessionManager(store, fetchFn, () => 10_000_000);
    session.seedAccessToken("access-plain", 10_000_000 + 3_600_000);
    await fetchHomeworkSets(
      new ApiClient(session, fetchFn),
      4242,
      "2026-10-12",
    );

    const handIn = calls.find(
      (call) =>
        call.url.includes("studiewijzeritemdagtoekenningen") &&
        call.url.includes("heeftInleverperiode=true"),
    );
    expect(handIn).toBeTruthy();
    const url = new URL(handIn!.url);
    expect(url.pathname).toBe("/rest/v1/studiewijzeritemdagtoekenningen");
    expect(url.searchParams.get("studiewijzerItem.heeftInleverperiode")).toBe(
      "true",
    );
    expect(url.searchParams.has("jaarWeek")).toBe(false);
  });

  it("turns HTML omschrijving into plain text", () => {
    const view = mapHomework({
      lesgroep: { vak: { naam: "SubjectA" } },
      studiewijzerItem: {
        huiswerkType: "HUISWERK",
        onderwerp: "Topic",
        omschrijving: "<p>Read <b>chapter</b> 3&nbsp;&amp; notes</p>",
      },
    });
    expect(htmlToPlain("<p>Read <b>chapter</b> 3&nbsp;&amp; notes</p>")).toBe(
      "Read chapter 3 & notes",
    );
    expect(view.omschrijving).toBe("Read chapter 3 & notes");
  });
});
