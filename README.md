# somtoday-mcp

[![CI](https://github.com/barzoj/somtoday-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/barzoj/somtoday-mcp/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/barzoj/somtoday-mcp/graph/badge.svg)](https://codecov.io/gh/barzoj/somtoday-mcp)
[![npm version](https://img.shields.io/npm/v/somtoday-mcp)](https://www.npmjs.com/package/somtoday-mcp)
[![License: MIT](https://img.shields.io/github/license/barzoj/somtoday-mcp)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)

Read-only [MCP](https://modelcontextprotocol.io/) server for the Somtoday parent portal. It lets an AI assistant such as Cursor or Claude Desktop look up your child's timetable, homework, and grades from your own parent account.

It runs locally on your computer over stdio. Nothing is sent anywhere except to Somtoday itself.

> **Disclaimer.** This is an unofficial community project. It is not affiliated with, endorsed by, or supported by Somtoday or Topicus. It works by interoperating with the undocumented internal web API that the official parent portal uses, so it may stop working or behave differently at any time without notice. It is intended for use with your own account, only reads data, and is provided as-is, without warranty of any kind (see [LICENSE](LICENSE)); use it at your own risk and in line with Somtoday's terms of use. "Somtoday" and "Topicus" are trademarks of their respective owners and are used here only to describe what the software works with.

## What it does

| Tool                  | What you get                                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `whoami`              | Your school label, the linked children with their numeric ids, and which portal sections are visible to you.                                                                                                                                                             |
| `lessons`             | The timetable for one day, and whether that day is a school holiday.                                                                                                                                                                                                     |
| `homework`            | What to do and learn on which day: every study-planner item for a date range (default today + 6 days, max 42), grouped by day, with description, learning goals, time estimate, test type, attachments (links), external links, hand-in window/status and the done tick. |
| `grades`              | The most recent results (up to 30) and averages per subject.                                                                                                                                                                                                             |
| `assignments`         | All hand-in assignments with window, status (upcoming, to do, waiting for review, approved), late flag, description, attachments and links. `status=open` keeps the ones still to do.                                                                                    |
| `assignment_detail`   | One assignment as the parent portal shows it: instruction, files, links, hand-in window and status. Submitted files and teacher reactions are only visible in the student's own session.                                                                                 |
| `study_material`      | Study material per subject: lesson material from the planner by date, year attachments by folder (file links), external links, and methods/publisher links. No arguments lists the subjects; `vak` picks one; `all=true` fetches every subject.                          |
| `schedule`            | Timetable for a date range (default today + 6 days, max 42): time, lesson hour, subject, room, teachers, type (test, exam, parent evening …), lesson notes, changes and cancellations, attachments, holidays.                                                            |
| `grades_latest`       | Newest results first with subject, column, description, grade, weight, test type, period, date, remarks and resits; `limit` (default 50, max 1000) and `dossier=examen` for SE results.                                                                                  |
| `grades_overview`     | Full grade overview for a school year: every subject, every result per period, report grades, weights and remarks. `schooljaar` picks an earlier year.                                                                                                                   |
| `subject_grades`      | Everything for one subject: every result column with weights and remarks, column definitions (also not yet graded), composite-test parts, for the progress and exam dossier. No `vak` lists the subjects.                                                                |
| `exam_grades`         | School-exam dossier (PTA/SE): per subject the SE average, every SE result, tests still to come and test-type averages.                                                                                                                                                   |
| `absence`             | Absence and registrations for the school year or grading period (absent, late, removed, homework/materials not in order) with counts and entries, plus active measures.                                                                                                  |
| `messages`            | Messages, read-only: newest conversations (subject, sender, date, unread, preview; `zoek`/`ongelezen` filters) or one full thread with `conversatieId`. Never marks anything as read.                                                                                    |
| `news`                | School news items (newest first, as text) and the unread count.                                                                                                                                                                                                          |
| `announcements`       | Somtoday-wide announcements shown in the portal.                                                                                                                                                                                                                         |
| `children`            | Linked children with profile, class, school data (mentors, year, programme), current placement and visible portal sections.                                                                                                                                              |
| `school_info`         | School contact data and the school's information pages; `paginaId` opens one page.                                                                                                                                                                                       |
| `teachers`            | Staff you can message, with the subjects they teach your child.                                                                                                                                                                                                          |
| `signing_requests`    | Digital signing requests (read-only; nothing is signed). Each item has `document: {tool: "signing_document", id, available}`.                                                                                                                                            |
| `signing_document`    | The (signed) PDF of one signing request, as the portal's download button: pass `document.id`; returns extracted text, max 10 MB. Fetched with your login token, so it is not a `fileUrl` for `download_attachment`.                                                      |
| `parent_evening`      | Parent-evening details (slots, teachers); finds invitations in your messages (read-only; nothing is booked).                                                                                                                                                             |
| `consents`            | Consents such as use of photos, as set in the portal (read-only).                                                                                                                                                                                                        |
| `download_attachment` | Read an attachment by `fileUrl`: https Somtoday hosts only (extend with `SOMTODAY_MCP_ATTACHMENT_HOSTS`), max 10 MB, no token sent; text from PDF/text/HTML/CSV/JSON.                                                                                                    |
| `auth_status`         | Whether a session is stored, where, and how the last token renewal went. Never returns tokens.                                                                                                                                                                           |

- `lessons` takes an optional `date` (`YYYY-MM-DD`, Europe/Amsterdam) and defaults to **tomorrow**. Range tools take `date`, or `from`/`to`.
- If more than one child is linked to your account, pass `leerlingId` (the numeric id from `whoami`).
- `assignments` with `status=open` hides past-due items that expect no digital hand-in (`inleveringenVerwacht: 0`, e.g. handed in on paper) and reports the count in `verborgenZonderInlevering`; pass `includeNoHandIn=true` to see them.
- If a section is switched off for your account, the tool says so and does not call that part of the API.

Not included: anything that changes data, such as sending messages, reporting absence, booking parent-evening slots, signing requests, or uploading hand-ins.

## Read-only and privacy

- Tools only send `GET` requests. Nothing is written, submitted, or marked as read.
- The server talks only to Somtoday's login and API servers.
- No telemetry or analytics.
- Your password is typed only into the Somtoday login page in a browser window. No tool, CLI flag, environment variable, or prompt ever asks for it.
- Tools never return tokens.

Timetables, homework, and grades are personal data about children. Keep the output on your own devices, use only accounts you are entitled to use, and do not share or republish it. Under the GDPR you are responsible for what you do with data you export.

## Install

Requires Node.js 22 or newer (the PDF text extraction used by `download_attachment` and `signing_document` does not run on Node 20).

Published on npm as [`somtoday-mcp`](https://www.npmjs.com/package/somtoday-mcp), with [provenance](https://docs.npmjs.com/generating-provenance-statements) from this repository's release workflow.

```bash
npx -y somtoday-mcp            # start the MCP server (used by your MCP client)
npx -y somtoday-mcp login      # sign in, once, in a terminal
```

Login opens a normal browser window. When **Google Chrome** (or else **Microsoft Edge**) is installed, that browser is used, with a fresh temporary profile that is deleted afterwards; it passes Somtoday's Cloudflare "Verify you are human" check more reliably. Only without Chrome/Edge does it fall back to Playwright's bundled Chromium; install that once in that case:

```bash
npx playwright install chromium
```

The window is started without the "controlled by automated software" markers; nothing else about the browser is changed.

From a checkout:

```bash
git clone https://github.com/barzoj/somtoday-mcp.git
cd somtoday-mcp
npm install
npm run build
npx playwright install chromium   # only needed without Chrome/Edge
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

1. A browser window (your installed Chrome or Edge, else Playwright Chromium) opens on the regular Somtoday login page. Search for your school there, the same way as in the official app.
2. Sign in as you normally would, including any two-step verification. You have 10 minutes (the Cloudflare check and school search count too).
3. When the window closes, the session is saved on your computer and the MCP server can use it.

If you know your school's tenant UUID you can skip the school search with `npx -y somtoday-mcp login --school-uuid <uuid>`.

If a tool is called before you have signed in, or after the saved session stops working, it returns:

`run `npx somtoday-mcp login` in a terminal`

Run login again in that case. If Somtoday cannot be reached, tools say so instead of asking you to log in.

### Commands

```bash
npx -y somtoday-mcp status           # where the session is stored, last renewal result (no tokens)
npx -y somtoday-mcp status --check   # also renews the token and calls the API once
npx -y somtoday-mcp logout           # delete the stored session from this computer
```

The same diagnostics are available to your MCP client through the `auth_status` tool.

Several MCP clients (for example two Cursor windows) can share one session: token renewal is serialized with a lock file in the config directory, and each renewal re-reads the stored session first.

<details>
<summary>Technical details</summary>

- OAuth 2.0 authorization code flow with PKCE (S256), using the public (secret-less) client id and redirect URI of Somtoday's native app. There is no client secret and nothing uses the Somtoday Connect partner API.
- The login page redirects to a custom `somtoday://` URL; Playwright reads the authorization code from that request inside the browser window. No local web server is started.
- Short-lived access tokens are kept in memory only.
- The school is chosen on Somtoday's own login page. The school's tenant comes from the token response (`somtoday_tenant`), and the label shown by `whoami` and `status` from the `orgname` claim (or, failing that, the school data of your account).

</details>

### Where the session is stored

| Platform        | Location                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS           | Login Keychain, service `somtoday-mcp`. Every write is read back and checked; if that fails, or `SOMTODAY_MCP_DISABLE_KEYCHAIN=1` is set, the file below is used |
| Linux / Windows | `session.json` with `0600` permissions in `$XDG_CONFIG_HOME/somtoday-mcp/` (default `~/.config/somtoday-mcp/`)                                                   |

To sign out, run `npx -y somtoday-mcp logout`.

### Environment variables

| Variable                        | Effect                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| `XDG_CONFIG_HOME`               | Base directory for the file fallback (default `~/.config`).    |
| `SOMTODAY_MCP_CONFIG_DIR`       | Use this directory instead of `$XDG_CONFIG_HOME/somtoday-mcp`. |
| `SOMTODAY_MCP_DISABLE_KEYCHAIN` | Set to `1` to skip the macOS Keychain and always use the file. |

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
