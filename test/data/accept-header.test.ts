import { describe, expect, it } from "vitest";
import { ApiClient } from "../../src/api/client.js";
import { ACCEPT } from "../../src/constants.js";
import { MemorySecretStore } from "../../src/auth/memory-store.js";
import { SessionManager } from "../../src/auth/session.js";
import { FAKE_SESSION, jsonResponse, scriptedFetch } from "../helpers.js";

describe("API Accept header", () => {
  it("sends the platinum JSON Accept header on every API request", async () => {
    const { fetchFn, calls } = scriptedFetch([
      async () => jsonResponse(200, { items: [] }),
      async () => jsonResponse(206, { items: [] }),
    ]);
    const store = new MemorySecretStore();
    await store.save(FAKE_SESSION);
    const session = new SessionManager(store, fetchFn, () => 10_000_000);
    session.seedAccessToken("access-plain", 10_000_000 + 3_600_000);
    const client = new ApiClient(session, fetchFn);

    await client.get("/account/me");
    await client.get("/plaatsingen");

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const headers = new Headers(call.init?.headers);
      expect(headers.get("accept")).toBe(ACCEPT);
      expect(headers.get("authorization")).toBe("Bearer access-plain");
    }
  });
});
