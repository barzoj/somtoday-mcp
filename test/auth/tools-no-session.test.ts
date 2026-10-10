import { describe, expect, it, vi } from "vitest";
import { LOGIN_INSTRUCTION } from "../../src/constants.js";
import { gradesTool } from "../../src/tools/grades.js";
import { homeworkTool } from "../../src/tools/homework.js";
import { lessonsTool } from "../../src/tools/lessons.js";
import { scriptedFetch, toolContext } from "../helpers.js";

describe("tools without a session", () => {
  it("returns the login instruction and does not open Playwright", async () => {
    const playwright = vi.fn();
    const { fetchFn, calls } = scriptedFetch([]);
    const ctx = await toolContext(fetchFn, null);

    const lessons = await lessonsTool(ctx, {});
    const homework = await homeworkTool(ctx, {});
    const grades = await gradesTool(ctx, {});

    for (const result of [lessons, homework, grades]) {
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBe(LOGIN_INSTRUCTION);
    }
    expect(calls).toHaveLength(0);
    expect(playwright).not.toHaveBeenCalled();
  });
});
