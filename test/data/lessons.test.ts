import { describe, expect, it } from "vitest";
import { filterLessonsForDate, holidaysOnDate } from "../../src/api/lessons.js";
import { amsterdamYmd } from "../../src/dates.js";
import { lessonsTool } from "../../src/tools/lessons.js";
import {
  accountMe,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";
import { herfstvakantie2026, kerstvakantie2026 } from "../fixtures/holidays.js";

describe("lesson date filter", () => {
  it("keeps an Amsterdam date and drops the next day, including a previous UTC date", () => {
    const ymd = "2026-10-12";
    const previousUtc = "2026-10-11T22:30:00.000Z";
    const nextDay = "2026-10-12T22:30:00.000Z";

    expect(amsterdamYmd(previousUtc)).toBe(ymd);
    expect(amsterdamYmd(nextDay)).toBe("2026-10-13");

    const kept = filterLessonsForDate(
      [
        {
          beginDatumTijd: previousUtc,
          eindDatumTijd: "2026-10-12T07:15:00.000Z",
          titel: "Kept",
          vak: { naam: "SubjectA", afkorting: "SA" },
          docentNamen: ["TeacherA"],
          afspraakItemType: "ROOSTERTOETS",
          statusNotifications: [
            { status: "2002", message: "x" },
            { status: "4007", message: "y" },
          ],
        },
        {
          beginDatumTijd: nextDay,
          titel: "Dropped",
        },
      ],
      ymd,
    );

    expect(kept).toHaveLength(1);
    expect(kept[0]?.titel).toBe("Kept");
    expect(kept[0]?.vak?.naam).toBe("SubjectA");
    expect(kept[0]?.type).toBe("ROOSTERTOETS");
    expect(kept[0]?.uitgevallen).toBe(true);
  });
});

describe("holiday detection", () => {
  it("recognises inclusive ranges with Somtoday offset datetimes", () => {
    const on = holidaysOnDate(
      [kerstvakantie2026, herfstvakantie2026],
      "2026-12-28",
    );
    expect(on.map((item) => item.naam)).toEqual(["Kerstvakantie"]);
    expect(holidaysOnDate([kerstvakantie2026], "2026-12-21")).toHaveLength(1);
    expect(holidaysOnDate([kerstvakantie2026], "2027-01-03")).toHaveLength(1);
    expect(holidaysOnDate([kerstvakantie2026], "2027-01-04")).toHaveLength(0);
  });

  it("sets holiday:true from /vakanties/leerling/{id}, not the empty verzorger list", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/afspraakitems\/4242\/jaar\/2026\/week\/53/, () => listResponse([])],
      [/\/vakanties\/verzorger/, () => listResponse([])],
      [
        /\/vakanties\/leerling\/4242/,
        () => listResponse([kerstvakantie2026, herfstvakantie2026]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await lessonsTool(ctx, { date: "2026-12-28" })) as {
      holiday: boolean;
      holidays: string[];
      lessons: unknown[];
    };
    expect(out.holiday).toBe(true);
    expect(out.holidays).toEqual(["Kerstvakantie"]);
    expect(out.lessons).toEqual([]);
    expect(
      calls.some((call) =>
        call.url.pathname.includes("/vakanties/leerling/4242"),
      ),
    ).toBe(true);
    expect(
      calls.some((call) => call.url.pathname.endsWith("/vakanties/verzorger")),
    ).toBe(false);
  });
});
