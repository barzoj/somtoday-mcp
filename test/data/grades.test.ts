import { describe, expect, it } from "vitest";
import { mapAverages, mapGrade } from "../../src/api/grades.js";

describe("grade mappers", () => {
  it("reads cijfer, weging, and vaknaam from a 206-shaped body", () => {
    const body = {
      items: [
        {
          cijfer: 6.5,
          weging: 2,
          formattedResultaat: "6,5",
          type: "Toetskolom",
          additionalObjects: { vaknaam: "SubjectA" },
        },
      ],
    };
    const mapped = mapGrade(body.items[0]!);
    expect(mapped.cijfer).toBe(6.5);
    expect(mapped.weging).toBe(2);
    expect(mapped.vaknaam).toBe("SubjectA");
  });

  it("reads averages from gemiddelden, not items", () => {
    const mapped = mapAverages({
      items: [
        {
          vakkeuze: { vak: { afkorting: "WRONG" } },
          voortgangsdossierResultaat: { formattedResultaat: "9,9" },
        },
      ],
      gemiddelden: [
        {
          vakkeuze: { vak: { afkorting: "SA" } },
          voortgangsdossierResultaat: { formattedResultaat: "6,8" },
        },
      ],
    });
    expect(mapped).toEqual([{ afkorting: "SA", formattedResultaat: "6,8" }]);
  });
});
