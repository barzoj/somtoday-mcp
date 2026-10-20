# Contributing

Thanks for helping improve `somtoday-mcp`. Please also read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security policy](SECURITY.md).

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
```

Format locally with `npm run format`.

Tests run with no network: `test/setup.ts` blocks `inloggen.somtoday.nl`, `api.somtoday.nl`, and `servers.somtoday.nl`, and `fetch` and the keychain are mocked. Do not add tests that talk to real Somtoday hosts.

## Conventional Commits

This repository uses [Conventional Commits](https://www.conventionalcommits.org/). Release Please turns them into `CHANGELOG.md` entries, git tags, and GitHub Releases.

Examples:

- `feat: add week view to lessons`
- `fix: handle empty homework lists`
- `docs: add VS Code MCP config`
- `chore: bump vitest`
- `ci: add macOS to the test matrix`

Use `feat` / `fix` for user-facing changes. Breaking changes should include `BREAKING CHANGE:` in the footer.

## Read-only

MCP tools must stay read-only: `GET` requests to the parent-portal API only.

**Write operations will not be accepted.** Pull requests that hand in homework, send messages, report absence, change settings, or otherwise change Somtoday data will be closed.

## Rules for changes

- Do not add telemetry or analytics.
- Never accept passwords through MCP tools, CLI flags, env vars, or prompts. Login happens only in the headed browser window.
- Do not commit tokens, authorization codes, session files, HAR files, screenshots, or API responses from a real account.
- Keep examples and fixtures neutral. Do not commit real school names, student or parent names, student ids, UUIDs from a real account, emails, or phone numbers.
- Update README and tests when changing auth, storage, or tool behavior.

## Releases and publishing

Maintainers merge to `main` using Conventional Commits. Release Please opens a release PR that bumps `package.json`, updates `CHANGELOG.md`, and tags a GitHub Release. Publishing to npm uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) from GitHub Actions (OIDC), with no long-lived npm token.

## Before opening a PR

```bash
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
```
