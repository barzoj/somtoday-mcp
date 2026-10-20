# Security policy

## Reporting a vulnerability

Please report security issues through [GitHub private vulnerability reporting](https://github.com/barzoj/somtoday-mcp/security/advisories/new) (Settings → Code security → Private vulnerability reporting). If that does not work for you, open a minimal GitHub issue that says you have a security report to share, without including secrets, tokens, authorization codes, personal data, or exploit details.

Do not send vulnerability reports to a personal email address.

## Token handling

`somtoday-mcp` signs in to the Somtoday parent portal with OAuth 2.0 (authorization code + PKCE) in a headed Playwright Chromium window. Passwords are typed only into that window; no MCP tool, CLI flag, env var, or prompt accepts a password.

- Never paste access tokens, refresh tokens, authorization codes, `code_verifier` values, or session files into GitHub issues, PRs, logs, screenshots, or chat transcripts.
- Access tokens are kept in memory only.
- On macOS, the refresh token and session metadata are stored in the user's login Keychain (service `somtoday-mcp`) through `/usr/bin/security`. The value is passed hex-encoded on stdin (`security -i`), never on the command line, and every write is read back and verified.
- Elsewhere, or when the keychain is unavailable, the session falls back to `session.json` with `0600` permissions under `$XDG_CONFIG_HOME/somtoday-mcp/` (default `~/.config/somtoday-mcp/`).
- Logs redact JWT-shaped strings and fields named `code`, `code_verifier`, `access_token`, `refresh_token`, `id_token`.

If you think a token was exposed, sign out of Somtoday in the browser (or change your password) and delete the stored session:

```bash
# macOS
security delete-generic-password -s somtoday-mcp
# fallback file
rm ~/.config/somtoday-mcp/session.json
```

## Scope

This project is read-only by design: MCP tools only send `GET` requests to the Somtoday API. Reports about accidental write calls, token disclosure, unsafe storage permissions, tokens sent to non-Somtoday hosts, or unintended external network calls are in scope.

This is an unofficial client. Vulnerabilities in Somtoday itself should be reported to Somtoday / Topicus, not here.
