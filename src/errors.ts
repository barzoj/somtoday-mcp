import { LOGIN_INSTRUCTION } from "./constants.js";

export class LoginRequiredError extends Error {
  constructor() {
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
