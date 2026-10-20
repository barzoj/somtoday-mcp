# somtoday-mcp

[![CI](https://github.com/barzoj/somtoday-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/barzoj/somtoday-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/somtoday-mcp)](https://www.npmjs.com/package/somtoday-mcp)
[![License: MIT](https://img.shields.io/github/license/barzoj/somtoday-mcp)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)

Read-only [MCP](https://modelcontextprotocol.io/) server for the Somtoday parent portal. It lets an AI assistant such as Cursor or Claude Desktop look up your child's timetable, homework, and grades from your own parent account.

It runs locally on your computer over stdio. Nothing is sent anywhere except to Somtoday itself.

> **Disclaimer.** This is an unofficial community project. It is not affiliated with, endorsed by, or supported by Somtoday or Topicus. It works by interoperating with the undocumented internal web API that the official parent portal uses, so it may stop working or behave differently at any time without notice. It is intended for use with your own account, only reads data, and is provided as-is, without warranty of any kind (see [LICENSE](LICENSE)); use it at your own risk and in line with Somtoday's terms of use. "Somtoday" and "Topicus" are trademarks of their respective owners and are used here only to describe what the software works with.

## What it does

| Tool       | What you get                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `whoami`   | Your school label, the linked children with their numeric ids, and which portal sections are visible to you. |
| `lessons`  | The timetable for one day, and whether that day is a school holiday.                                         |
| `homework` | Homework and study-planner items for one day: per lesson, per day, per week, and hand-in assignments.        |
| `grades`   | The most recent results (up to 30) and averages per subject.                                                 |

- `lessons` and `homework` take an optional `date` (`YYYY-MM-DD`, Europe/Amsterdam) and default to **tomorrow**.
- If more than one child is linked to your account, pass `leerlingId` (the numeric id from `whoami`).
- If a section is switched off for your account, the tool says so and does not call that part of the API.

Not included: news, messages, absence reporting, parent-evening scheduling, uploads, or anything that changes data.

## Read-only and privacy

- Tools only send `GET` requests. Nothing is written, submitted, or marked as read.
- The server talks only to Somtoday's login and API servers. During login it also downloads the public list of schools (from Somtoday, or a mirror on GitHub if that is unavailable).
- No telemetry or analytics.
- Your password is typed only into the Somtoday login page in a browser window. No tool, CLI flag, environment variable, or prompt ever asks for it.
- Tools never return tokens.

Timetables, homework, and grades are personal data about children. Keep the output on your own devices, use only accounts you are entitled to use, and do not share or republish it. Under the GDPR you are responsible for what you do with data you export.

## Install

Requires Node.js 22 or newer.

> The package is not published to npm yet. Until it is, use the "From a checkout" steps below; `npx somtoday-mcp` will not find it.

```bash
npx -y somtoday-mcp            # start the MCP server (used by your MCP client)
npx -y somtoday-mcp login      # sign in, once, in a terminal
```

Login uses Playwright's Chromium. Install it once:

```bash
npx playwright install chromium
```

From a checkout:

```bash
git clone https://github.com/barzoj/somtoday-mcp.git
cd somtoday-mcp
npm install
npm run build
npx playwright install chromium
node dist/cli.js login
```

## MCP client config

### Cursor

`~/.cursor/mcp.json`:

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

### Claude Desktop

`claude_desktop_config.json`:

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

### From a local checkout

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

## Signing in

Run login in a terminal, not from inside your MCP client:

```bash
npx -y somtoday-mcp login
```

1. Type (part of) your school's name. The CLI looks it up in Somtoday's public school list and asks again if several schools match.
2. A Chromium window opens on the regular Somtoday login page. Sign in there as you normally would, including any two-step verification. You have 5 minutes.
3. When the window closes, the session is saved on your computer and the MCP server can use it.

If a tool is called before you have signed in, or after the saved session stops working, it returns:

`run `npx somtoday-mcp login` in a terminal`

Run login again in that case. Session renewal is still being improved, so for now you may need to sign in again more often than you would in the official app.

<details>
<summary>Technical details</summary>

- OAuth 2.0 authorization code flow with PKCE (S256), using the public (secret-less) client id and redirect URI of Somtoday's native app. There is no client secret and nothing uses the Somtoday Connect partner API.
- The login page redirects to a custom `somtoday://` URL; Playwright reads the authorization code from that request inside the browser window. No local web server is started.
- Short-lived access tokens are kept in memory only.
- The school list comes from `servers.somtoday.nl/organisaties.json`, with a public mirror as fallback when that host is unavailable.

</details>

### Where the session is stored

| Platform        | Location                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| macOS           | Login Keychain, service `somtoday-mcp` (falls back to the file below if the keychain cannot be used)           |
| Linux / Windows | `session.json` with `0600` permissions in `$XDG_CONFIG_HOME/somtoday-mcp/` (default `~/.config/somtoday-mcp/`) |

To sign out, delete the stored session:

```bash
security delete-generic-password -s somtoday-mcp   # macOS keychain
rm ~/.config/somtoday-mcp/session.json             # file fallback
```

### Environment variables

| Variable          | Effect                                                      |
| ----------------- | ----------------------------------------------------------- |
| `XDG_CONFIG_HOME` | Base directory for the file fallback (default `~/.config`). |

Logs go to stderr (stdout is reserved for the MCP protocol) and redact token-like values.

## Development

```bash
npm install
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
```

Tests never touch the network: `fetch` and the keychain are mocked, and requests to Somtoday hosts fail on purpose. See [CONTRIBUTING.md](CONTRIBUTING.md) for the rules on test data and privacy, and [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

`ouder-portal.openapi.yaml` describes the parts of the parent-portal API this project relies on, as observed from the portal; it is not an official specification.

### Manual check against a real account

Not part of CI. Write down HTTP status codes only; never paste tokens, codes, names, or API responses.

1. `node dist/cli.js login` and complete the sign-in.
2. Call `whoami`, `lessons`, `homework`, and `grades` from your MCP client.
3. Restart the MCP server and call a tool again, to check that the saved session is picked up.

## License

[MIT](LICENSE). Not affiliated with Somtoday or Topicus.
