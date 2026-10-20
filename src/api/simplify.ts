import { htmlToPlain } from "../html.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const DROP_KEYS = new Set(["links", "permissions", "$type"]);

/** Fields that hold portal HTML; returned as plain text. */
export const HTML_KEYS = new Set([
  "omschrijving",
  "inhoud",
  "leerdoelen",
  "introductie",
  "tekst",
  "toelichting",
]);

/** Numeric id of a Linkable resource (`links[rel=self].id`, else `koppeling`). */
export function linkId(value: unknown): number | undefined {
  const links = (value as { links?: unknown } | null)?.links;
  if (!Array.isArray(links)) {
    return undefined;
  }
  const self =
    links.find((link) => (link as { rel?: string })?.rel === "self") ??
    links.find((link) => (link as { rel?: string })?.rel === "koppeling");
  const id = (self as { id?: unknown } | undefined)?.id;
  return typeof id === "number" ? id : undefined;
}

/**
 * Generic, lossless-enough cleanup for API payloads whose exact shape is not
 * modelled: drops `links`, `permissions` and `$type`, adds `id` from the self
 * link, lifts `additionalObjects` into the object, turns known HTML fields
 * into plain text, and removes nulls and empty arrays.
 */
export function simplify(value: unknown, depth = 0): Json | undefined {
  if (depth > 12) {
    return undefined;
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => simplify(item, depth + 1))
      .filter((item): item is Json => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, Json> = {};
    const id = linkId(source);
    if (id !== undefined && source.id === undefined) {
      out.id = id;
    }
    for (const [key, raw] of Object.entries(source)) {
      if (DROP_KEYS.has(key)) continue;
      if (key === "additionalObjects" && raw && typeof raw === "object") {
        for (const [extraKey, extraRaw] of Object.entries(raw)) {
          if (extraKey in out || extraKey in source) continue;
          const extra = simplify(unwrap(extraRaw), depth + 1);
          if (extra !== undefined) out[extraKey] = extra;
        }
        continue;
      }
      if (HTML_KEYS.has(key) && typeof raw === "string") {
        const text = htmlToPlain(raw);
        if (text) out[key] = text;
        continue;
      }
      const cleaned = simplify(raw, depth + 1);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return undefined;
}

/** `{ $type: "LinkableWrapper", items: [...] }` → the items. */
export function unwrap(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as { items?: unknown }).items) &&
    Object.keys(value).every((key) => key === "items" || key === "$type")
  ) {
    return (value as { items: unknown[] }).items;
  }
  return value;
}
