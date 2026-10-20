const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeCodePoint(code: number, original: string): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
    return original;
  }
  return String.fromCodePoint(code);
}

/** Decode entities in a single pass so `&amp;lt;` becomes `&lt;`, not `<`. */
function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (match, dec?: string, hex?: string, name?: string) => {
      if (dec) return decodeCodePoint(Number(dec), match);
      if (hex) return decodeCodePoint(parseInt(hex, 16), match);
      return NAMED_ENTITIES[name!.toLowerCase()] ?? match;
    },
  );
}

/** Remove tags until none are left (handles nested fragments like `<<b>script>`). */
function stripTags(text: string): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(/<[^<>]*>/g, "");
  } while (current !== previous);
  return current;
}

/**
 * Convert portal HTML (homework descriptions) to plain text for MCP output.
 * The result is plain text, never rendered as HTML.
 */
export function htmlToPlain(html: string | undefined | null): string {
  if (!html) {
    return "";
  }
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n");
  return decodeEntities(stripTags(withBreaks))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
