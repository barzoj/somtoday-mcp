import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { LOGIN_INSTRUCTION } from "../../src/constants.js";
import { createServer } from "../../src/server.js";
import { scriptedFetch, sessionWithStore } from "../helpers.js";

async function connect() {
  const { fetchFn } = scriptedFetch([]);
  const session = await sessionWithStore(fetchFn, null);
  const server = createServer(session);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

const text = (result: Awaited<ReturnType<Client["callTool"]>>) =>
  (result.content as Array<{ text: string }>)[0]?.text ?? "";

describe("id-like inputs", () => {
  it.each([
    ["assignment_detail", { toekenningId: 123, leerlingId: 4242 }],
    ["assignment_detail", { toekenningId: "123", leerlingId: "4242" }],
    ["homework", { leerlingId: 4242 }],
    ["study_material", { vak: 77 }],
    ["subject_grades", { vak: "wi" }],
    ["messages", { conversatieId: 9 }],
    ["school_info", { paginaId: "9" }],
    ["parent_evening", { id: 12 }],
  ])("%s accepts %j", async (name, args) => {
    const client = await connect();
    const result = await client.callTool({ name, arguments: args });
    expect(text(result)).not.toMatch(/Input validation error/);
    expect(text(result)).toBe(LOGIN_INSTRUCTION);
  });

  it.each([
    ["assignment_detail", { toekenningId: "12a" }],
    ["assignment_detail", { toekenningId: -1 }],
    ["homework", { leerlingId: 1.5 }],
  ])("%s rejects %j", async (name, args) => {
    const client = await connect();
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/Input validation error|Invalid/);
  });
});

describe("tool schemas", () => {
  it("inline every field (no shared $ref that some clients cannot resolve)", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(JSON.stringify(tool.inputSchema), tool.name).not.toContain("$ref");
    }
  });
});

describe("download_attachment input (zod 4)", () => {
  it("advertises a URI string and rejects non-URLs before any fetch", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const schema = tools.find((tool) => tool.name === "download_attachment")
      ?.inputSchema as unknown as {
      properties: { url: Record<string, unknown> };
    };
    expect(schema.properties.url).toMatchObject({
      type: "string",
      format: "uri",
    });
    const result = await client.callTool({
      name: "download_attachment",
      arguments: { url: "not a url" },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/Input validation error/);
  });
});
