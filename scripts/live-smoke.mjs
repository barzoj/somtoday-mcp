#!/usr/bin/env node
/* global process, console, URL */
// Live smoke test: calls every MCP tool against the real session and prints
// only shapes (ok/error, item counts, top-level keys, attachment hosts).
// It never prints values, names, ids or tokens.
//
//   npm run build
//   SOMTODAY_MCP_CONFIG_DIR=/tmp/som-test node scripts/live-smoke.mjs [tool ...]
//
// Optional: SMOKE_LEERLING_ID=<id> when several children are linked.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../dist/server.js";

const only = new Set(process.argv.slice(2));
const SKIP = new Set(["auth_status"]);
// Tools that need an argument found in another tool's output.
const DERIVED = {
  assignment_detail: {
    from: "assignments",
    key: "toekenningId",
    arg: "toekenningId",
  },
  study_material: { from: "study_material", key: null, arg: null },
  subject_grades: { from: "grades_overview", key: "vakUuid", arg: "vak" },
  school_info: { from: "school_info", key: null, arg: null },
  download_attachment: {
    from: "study_material_all",
    key: "fileUrl",
    arg: "url",
  },
};

const server = createServer();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "live-smoke", version: "0" });
await client.connect(clientTransport);

const found = new Map(); // key -> first value seen (kept in memory only)
const hosts = new Set();

function remember(value, depth = 0) {
  if (depth > 10 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) remember(item, depth + 1);
    return;
  }
  for (const [key, inner] of Object.entries(value)) {
    if (
      (typeof inner === "string" || typeof inner === "number") &&
      !found.has(key)
    ) {
      found.set(key, inner);
    }
    if (
      (key === "fileUrl" || key === "url" || key === "uri") &&
      typeof inner === "string"
    ) {
      try {
        hosts.add(new URL(inner).hostname);
      } catch {
        // not a URL
      }
    }
    remember(inner, depth + 1);
  }
}

function shape(value) {
  if (Array.isArray(value)) return { items: value.length };
  if (!value || typeof value !== "object") return { type: typeof value };
  const counts = {};
  for (const [key, inner] of Object.entries(value)) {
    if (Array.isArray(inner)) counts[key] = inner.length;
    else if (inner && typeof inner === "object") {
      for (const [k2, v2] of Object.entries(inner)) {
        if (Array.isArray(v2)) counts[`${key}.${k2}`] = v2.length;
      }
    }
  }
  return { keys: Object.keys(value), counts };
}

function scrub(text) {
  return String(text)
    .replace(/\d{3,}/g, "#")
    .slice(0, 160);
}

async function call(name, args) {
  const started = Date.now();
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content?.[0]?.text ?? "";
    const ms = Date.now() - started;
    if (result.isError) {
      console.log(`✗ ${name} (${ms} ms) error: ${scrub(text)}`);
      return undefined;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.log(`? ${name} (${ms} ms) non-JSON output, ${text.length} chars`);
      return undefined;
    }
    remember(parsed);
    const avail =
      parsed?.available === false
        ? ` not-available(${parsed.status ?? "-"})`
        : "";
    console.log(
      `✓ ${name} (${ms} ms)${avail} ${JSON.stringify(shape(parsed))}`,
    );
    return parsed;
  } catch (error) {
    console.log(`✗ ${name} threw: ${scrub(error?.message ?? error)}`);
    return undefined;
  }
}

const { tools } = await client.listTools();
const leerling = process.env.SMOKE_LEERLING_ID;
const base = (tool) => {
  const props = tool.inputSchema?.properties ?? {};
  return leerling && "leerlingId" in props ? { leerlingId: leerling } : {};
};

const ordered = [...tools].sort(
  (a, b) => Number(a.name in DERIVED) - Number(b.name in DERIVED),
);
for (const tool of ordered) {
  if (SKIP.has(tool.name) || (only.size && !only.has(tool.name))) continue;
  const required = tool.inputSchema?.required ?? [];
  // Tools with required arguments only run in the derived pass below.
  if (required.every((key) => key === "leerlingId" && leerling)) {
    await call(tool.name, base(tool));
  }
  const props = tool.inputSchema?.properties ?? {};
  // Second pass with a derived argument, when the tool takes one.
  if (tool.name === "study_material" && "all" in props) {
    await call("study_material", { ...base(tool), all: true });
  }
  if (
    tool.name === "school_info" &&
    "paginaId" in props &&
    found.has("paginaId")
  ) {
    await call("school_info", {
      ...base(tool),
      paginaId: found.get("paginaId"),
    });
  }
  const derived = DERIVED[tool.name];
  if (derived?.key && derived.arg in props) {
    if (found.has(derived.key)) {
      await call(tool.name, {
        ...base(tool),
        [derived.arg]: String(found.get(derived.key)),
      });
    } else {
      console.log(
        `- ${tool.name}: no ${derived.key} found in earlier output, skipped the detail call`,
      );
    }
  }
}

console.log(
  `attachment/link hosts seen: ${[...hosts].sort().join(", ") || "(none)"}`,
);
await client.close();
