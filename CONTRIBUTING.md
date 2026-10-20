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
npm run test:coverage
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

Maintainers merge to `main` using Conventional Commits. Release Please opens a release PR that bumps `package.json`, updates `CHANGELOG.md`, and tags a GitHub Release (`vX.Y.Z`).

The `Release Please` workflow (`.github/workflows/release-please.yml`) publishes when it creates a release (`steps.release.outputs.release_created`), and skips the publish if that version is already on npm:

```bash
npm publish --provenance --access public
```

`--provenance` requires a **public** repository. Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) for GitHub Actions, repo `barzoj/somtoday-mcp`, workflow `release-please.yml` (OIDC, `id-token: write`). There is no npm token; do not set `NODE_AUTH_TOKEN` (even empty). To publish an existing tag: `gh workflow run release-please.yml -f publish_tag=vX.Y.Z`.

The trusted publisher can only be configured on a package that already exists, so the very first version is published manually by a maintainer, after which the trusted publisher is attached on npmjs.com.

`.github/workflows/publish.yml` is `workflow_dispatch` only for tip-of-branch republish; tagged republishes use `release-please.yml` with `publish_tag`.

Do not publish from a laptop with a long-lived token unless you are recovering from a broken trusted-publisher setup.

## Before opening a PR

```bash
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
npm run test:coverage
```
