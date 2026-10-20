import { describe, expect, it } from "vitest";
import { htmlToPlain } from "../../src/html.js";

describe("htmlToPlain", () => {
  it("returns an empty string for missing input", () => {
    expect(htmlToPlain(undefined)).toBe("");
    expect(htmlToPlain(null)).toBe("");
    expect(htmlToPlain("")).toBe("");
  });

  it("turns block tags into line breaks and strips the rest", () => {
    expect(htmlToPlain("<p>One</p><p>Two<br/>Three</p><div>Four</div>")).toBe(
      "One\nTwo\nThree\nFour",
    );
  });

  it("decodes entities exactly once", () => {
    expect(htmlToPlain("a &amp;lt; b")).toBe("a &lt; b");
    expect(htmlToPlain("&lt;b&gt; &quot;x&quot; &#39;y&#x27;")).toBe(
      "<b> \"x\" 'y'",
    );
  });

  it("removes nested tag fragments completely", () => {
    expect(htmlToPlain("<<b>script>alert(1)<</b>/script>")).toBe("alert(1)");
  });

  it("leaves unknown or out-of-range entities alone", () => {
    expect(htmlToPlain("&bogus; &#99999999;")).toBe("&bogus; &#99999999;");
  });

  it("collapses runs of blank lines", () => {
    expect(htmlToPlain("a<br><br><br><br>b")).toBe("a\n\nb");
  });
});
