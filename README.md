# somtoday-mcp

Read-only MCP server for the Somtoday parent portal (`leerling.somtoday.nl`). Auth is the product; the tools are a thin layer on top of four GETs from `ouder-portal.openapi.yaml` (0.2.0).

This is **not** the Somtoday Connect partner API. There is no client-credentials flow and nothing under `/rest/v1/connect/...`.

Passwords are typed only in a headed Playwright Chromium window. No MCP tool, CLI flag, env var, or prompt accepts a password.

## Run

```bash
npx somtoday-mcp            # MCP stdio server (stdout is JSON-RPC only)
npx somtoday-mcp login      # interactive login
```

During development, after `npm run build`:

```bash
node dist/cli.js
node dist/cli.js login
```

Chromium is required once for login:

```bash
npx playwright install chromium
```

The stdio server starts even if that browser binary is missing. Login opens Playwright Chromium, not the system browser and not Cursor's browser.

## Cursor config

After publish, or via a local path:

```json
{
  "mcpServers": {
    "somtoday": {
      "command": "npx",
      "args": ["-y", "somtoday-mcp"]
    }
  }
}
```

Local checkout:

```json
{
  "mcpServers": {
    "somtoday": {
      "command": "node",
      "args": ["/absolute/path/to/somtoday-mcp/dist/cli.js"]
    }
  }
}
```

If a tool is called with no session, the tool error text is exactly:

`run `npx somtoday-mcp login` in a terminal`

Do not run login from inside an MCP tool. Stdin is the protocol.

## Login

1. The CLI asks for a school name and matches `https://servers.somtoday.nl/organisaties.json`. Several matches means ask again. Nothing is hardcoded.
2. PKCE S256 with public client `somtoday-leerling-native` and redirect `somtoday://nl.topicus.somtoday.leerling/oauth/callback`.
3. Headed Chromium (5 minute timeout). The identity provider 302s to a custom scheme; Playwright captures that URL from `request` / `requestfailed`. A loopback HTTP server will not see it. The OS handler is not registered.
4. The authorization code is exchanged at `https://inloggen.somtoday.nl/oauth2/token`. On rejection, one retry adds `session=no_session` and `tenant_uuid`.
5. Refresh uses the client id that issued the token. A UUID fallback is one explicit attempt after an `invalid_client` style error.

The refresh token, client id, tenant uuid, and API base URL are stored in the macOS keychain (service `somtoday-mcp`) or, if that command fails, a `0600` file under the user config dir. Access tokens stay in memory.

Logs redact JWT-shaped strings and fields named `code`, `code_verifier`, `access_token`, `refresh_token`, `id_token`.

## Tools

| Tool | API |
| --- | --- |
| `whoami` | `GET /account/me?additional=restricties` |
| `lessons` | `GET /afspraakitems/{id}/jaar/{year}/week/{isoWeek}` and `GET /vakanties/verzorger` |
| `homework` | lesson / day / week study-planner lists, plus hand-ins (`heeftInleverperiode=true`, no `jaarWeek`) |
| `grades` | latest progress results, current placement, subject averages (`gemiddelden`) |

Dates are Europe/Amsterdam. ISO weeks look like `2026~41`. `lessons` and `homework` default to tomorrow. Several linked students require a `leerlingId` argument (numeric, not a UUID). A section flag that is false is returned as such; the hidden API is not called.

Out of scope: news, messages, absence, parent evening, zelfplannen, uploads, `PUT /swigemaakt`, and one tool per OpenAPI path.

## Develop

Node 22. Package is ESM, TypeScript strict.

```bash
npm install
npm run build
npm test
npx tsc --noEmit
npm pack --dry-run
```

CI runs `tsc --noEmit` and `vitest` with no network. `fetch` and the keychain are mocked. Tests must not call `inloggen.somtoday.nl`, `api.somtoday.nl`, or `servers.somtoday.nl`.

## Manual acceptance (not CI)

Record **HTTP statuses only**. Do not paste tokens, codes, or names.

1. `npx playwright install chromium` (once).
2. `npx somtoday-mcp login` — headed window; note authorize and token-exchange statuses.
3. Call `lessons` — note the GET status.
4. Call `homework` — note the GET statuses.
5. Call `grades` — note the GET statuses.
6. Restart the MCP server and call a tool again. The access token is memory-only, so this forces a refresh. Note the refresh POST status.
