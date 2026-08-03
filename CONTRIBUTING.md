# Contributing

This is a Claude Code skill: a Markdown instruction file (`SKILL.md`) plus a
set of small, dependency-free Node scripts it calls. Contributions are
welcome.

## Ground rules

- **Read-only by default.** Any new script must not modify production state,
  request indexing, or write anything outside `reports/` without explicit
  user approval baked into the workflow, not just the script.
- **No new dependencies without a strong reason.** Everything here runs with
  plain Node (`fetch`/`crypto`/`https`/`fs` built-ins). Before adding a
  package, check whether a built-in module can do it — see how
  `scripts/lib/gsc-api-client.cjs` implements JWT signing + OAuth without
  `googleapis`/`google-auth-library`.
- **Never invent or hardcode credentials.** Secrets stay in gitignored files
  or environment variables, loaded via `scripts/lib/config.cjs` /
  `loadServiceAccountCredentials()`.
- **Evidence-first.** If you're adding a new classification rule or workflow
  phase, ground it in something checkable (a documented Google behavior, a
  real observed API quirk) — see `references/classification-guide.md`'s
  "Never" section for the standard this project holds itself to.

## Reporting a bug in the tool itself

Open an issue with: which script, the exact command, and (with secrets
redacted) the output you got vs. expected. If it's a GSC API
inconsistency (API vs. UI disagreeing, `.list()` omitting data, etc.), that's
exactly the kind of finding worth documenting as a caveat in
`scripts/lib/gsc-api-client.cjs` for future users — PRs for that are
especially welcome.

## Adding a new script

- One script, one responsibility (see the existing `scripts/*.cjs` for the
  pattern — CLI wrapper + shared logic in `scripts/lib/`).
- Print JSON to stdout, errors to stderr, non-zero exit on failure.
- Update `SKILL.md` (which phase it belongs to) and `README.md`'s scripts
  table.
