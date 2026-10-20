import { LOGIN_INSTRUCTION } from "./constants.js";

export class LoginRequiredError extends Error {
  constructor(readonly reason?: string) {
    super(LOGIN_INSTRUCTION);
    this.name = "LoginRequiredError";
  }
}

export class AuthFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthFlowError";
  }
}

/** The token endpoint answered 4xx: the refresh token (or client) was rejected. */
export class RefreshRejectedError extends AuthFlowError {
  constructor(
    readonly status: number,
    readonly oauthError: string | undefined,
  ) {
    super(`Refresh rejected: HTTP ${status} ${oauthError ?? ""}`.trim());
    this.name = "RefreshRejectedError";
  }
}

/** Somtoday could not be reached (network error, timeout, or 5xx). Not a reason to log in again. */
export class AuthNetworkError extends Error {
  constructor(detail: string) {
    super(
      `Could not reach Somtoday to renew the session (${detail}). Try again in a moment.`,
    );
    this.name = "AuthNetworkError";
  }
}

/** The stored session exists but cannot be read (keychain or file problem). */
export class SessionUnreadableError extends Error {
  constructor(detail: string) {
    super(
      `${detail}. Run \`npx somtoday-mcp status\` for details, then \`npx somtoday-mcp login\`.`,
    );
    this.name = "SessionUnreadableError";
  }
}

export function formatError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const parts = [error.message];
  let current: unknown = error.cause;
  while (current) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(": ");
}
