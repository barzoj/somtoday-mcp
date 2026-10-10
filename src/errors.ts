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
