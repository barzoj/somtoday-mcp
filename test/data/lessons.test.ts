import { describe, expect, it } from "vitest";
import { filterLessonsForDate } from "../../src/api/lessons.js";
import { amsterdamYmd } from "../../src/dates.js";

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
  });
});
