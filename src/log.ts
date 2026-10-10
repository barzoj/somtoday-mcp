const SENSITIVE_FIELDS = [
  "code",
  "code_verifier",
  "access_token",
  "refresh_token",
  "id_token",
] as const;

const JWT_RE =
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g;

const FIELD_RE = new RegExp(
  `((?:${SENSITIVE_FIELDS.join("|")})\\s*[=:]\\s*)([^&\\s"',}]+)`,
  "gi",
);

const JSON_FIELD_RE = new RegExp(
  `("(?:${SENSITIVE_FIELDS.join("|")})"\\s*:\\s*")([^"]*)(")`,
  "gi",
);

export function redact(input: string): string {
  return input
    .replace(JWT_RE, "[redacted]")
    .replace(JSON_FIELD_RE, "$1[redacted]$3")
    .replace(FIELD_RE, "$1[redacted]");
}

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redact(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (
        SENSITIVE_FIELDS.includes(
          key.toLowerCase() as (typeof SENSITIVE_FIELDS)[number],
        )
      ) {
        out[key] = "[redacted]";
      } else {
        out[key] = redactValue(nested);
      }
    }
    return out;
  }
  return value;
}

export function logError(...args: unknown[]): void {
  const parts = args.map((arg) => {
    if (typeof arg === "string") {
      return redact(arg);
    }
    try {
      return redact(JSON.stringify(redactValue(arg)));
    } catch {
      return redact(String(arg));
    }
  });
  console.error(...parts);
}

export function logInfo(...args: unknown[]): void {
  const parts = args.map((arg) =>
    typeof arg === "string" ? redact(arg) : redact(String(arg)),
  );
  console.error(...parts);
}
