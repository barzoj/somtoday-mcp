export type ParsedRedirect = {
  code: string;
  state: string;
};

export function isCallbackUrl(url: string): boolean {
  if (!url.includes("callback")) {
    return false;
  }
  return (
    url.startsWith("somtodayleerling://") || url.startsWith("somtoday://")
  );
}

export function parseRedirectUrl(url: string): ParsedRedirect {
  const parsed = new URL(url);
  const code = parsed.searchParams.get("code") ?? "";
  const state = parsed.searchParams.get("state") ?? "";
  return { code, state };
}

export function looksLikeCallbackHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!isCallbackUrl(url)) {
      return false;
    }
    if (parsed.protocol === "somtodayleerling:") {
      return parsed.hostname === "oauth";
    }
    if (parsed.protocol === "somtoday:") {
      return (
        parsed.hostname === "nl.topicus.somtoday.leerling" &&
        parsed.pathname.endsWith("/callback")
      );
    }
    return false;
  } catch {
    return false;
  }
}
