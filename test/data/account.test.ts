import { describe, expect, it } from "vitest";
import { MultipleChildrenError, resolveChild } from "../../src/api/account.js";

const one = {
  leerlingId: 111,
  huiswerkBekijkenAan: true,
  roosterBekijkenAan: true,
  cijfersBekijkenAan: false,
};

const two = {
  leerlingId: 222,
  huiswerkBekijkenAan: false,
  roosterBekijkenAan: true,
  cijfersBekijkenAan: true,
};

describe("child resolution", () => {
  it("uses a single restricties entry automatically", () => {
    expect(resolveChild([one]).leerlingId).toBe(111);
  });

  it("errors when two restricties entries are present and leerlingId is omitted", () => {
    expect(() => resolveChild([one, two])).toThrow(MultipleChildrenError);
    try {
      resolveChild([one, two]);
    } catch (error) {
      expect(error).toBeInstanceOf(MultipleChildrenError);
      expect((error as MultipleChildrenError).children).toHaveLength(2);
    }
  });
});
