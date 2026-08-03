You are diagnosing a Google Search Console (GSC) indexing issue for this
site. Your job is evidence collection, comparison, classification, and
recommendation — **never** automatic code changes.

This skill may live in a frontend repository, but the frontend does not
necessarily own every issue. Classify the likely owner honestly: frontend,
backend/API, prerender, CDN/infrastructure, CMS/content/data, sitemap
generation, Google stale state / no current code owner, cross-system, or
unknown.

Full classification taxonomy and rules: `references/classification-guide.md`
Worked example (from this tool's origin project): `references/examples/tris-artist-case-study.md`
Report skeleton: `templates/report-template.md`
JSON evidence shape: `templates/evidence-schema.json`
Optional per-site config: `gsc-indexing-debugger.config.json` (see `.config.example.json`)
Scripts: `scripts/*.cjs` (plain Node, no dependencies — run with `node`).
`gsc-api-inspect.cjs`/`gsc-api-list-sitemaps.cjs`/`gsc-api-get-sitemap.cjs`
need a service account key (optional — see "GSC API setup" in `README.md`);
every other script needs nothing beyond Node itself.

# CORE SAFETY RULES

- Never modify application code automatically. You may *inspect* code to
  locate a likely cause after a current bug is confirmed, but do not edit it
  unless the user explicitly starts a separate, approved fix workflow.
- Read-only by default: HTTP GET/HEAD, local parsing, hashing, reading repo
  code/docs, generating local reports. Never: source-code modification,
  production data modification, deployments, CDN cache invalidations, cache
  purges, sitemap/canonical/config changes, bulk indexing requests, or any
  destructive command — without explicit approval.
- Never request indexing automatically. For a single URL you may recommend
  it with evidence, but require explicit user approval before doing so. Never
  bulk-request indexing.
- **GSC evidence is automated when configured, manual otherwise.**
  `scripts/gsc-api-inspect.cjs` calls the real Search Console URL Inspection
  API using a service-account key (read-only `webmasters.readonly` scope,
  hardcoded — this client can never mutate Search Console state). This is a
  read-only inspection call, so it runs by default in Phase 2 without asking
  — same as any other GET in this workflow. If no key is configured (the
  common case for a fresh clone), the script prints
  `{ "automated": false, ... }` instead of failing — fall back to asking the
  user to paste GSC screenshots/text/URL-Inspection-output/CSV. Never invent
  credentials, never ask the user to paste secrets, never print or store
  credentials, never log the access token. See "GSC API setup" in
  `README.md` for how a developer configures this.
- Related repos (a separate backend/API, a prerender/rendering service,
  admin apps, etc.) may or may not be present in the current workspace. If
  present, you may inspect them when relevant. If absent — the common case
  for anyone who's only cloned this one repo — do not guess their
  implementation or pretend to have inspected them. State the missing
  repository and give exact next checks for that owner.
- Evidence storage: write investigation output under `reports/gsc-indexing-debugger/`
  at the repo root (gitignored — see `.gitignore`). Never commit downloaded
  production HTML, credentials, tokens, or large evidence dumps. Reports
  meant for a ticket may be copied elsewhere only when the user asks.

# INPUT MODES

**Mode 1 — Single URL.** e.g. "investigate https://www.example.com/some-page".
Run the full single-URL workflow below.

**Mode 2 — Affected URL + Google-selected canonical.** Run the full workflow
on both URLs, then Phase 7 comparison between them.

**Mode 3 — Small URL list.** Run the single-URL workflow on each, then look
for shared patterns across them.

**Mode 4 — Bulk CSV/export.** Do NOT deeply investigate every URL.
1. `node scripts/parse-gsc-export.cjs <file>` to validate, cluster by route
   family + reason, and get representative samples.
2. Show the cluster summary and the investigation plan (which representatives
   you propose to deep-dive and why).
3. Wait for approval before running Phases 3–10 on the representatives.
4. Never request indexing in bulk mode.

**Mode 5 — Follow-up verification.** Re-run `gsc-api-inspect.cjs` (or ask for
fresh manual GSC input if not automated) plus the live-fetch + stability +
sitemap phases on the previously affected URL, compare the new
`lastCrawlTime`/Google-selected canonical against the prior investigation,
and update the classification (typically `WAITING_FOR_RECRAWL` →
`HEALTHY`/`ALREADY_RESOLVED`, or still waiting).

# WORKFLOW

## Phase 1 — Capture the reported issue
Record affected URL, issue category, reported date, source, reported
Google-selected canonical, ticket assumptions, proposed root cause, prior
investigation/indexing-request history. Tag every statement `FACT`,
`HYPOTHESIS`, `HISTORICAL_STATE`, or `CURRENT_STATE`. Never silently promote a
ticket claim to a fact.

## Phase 2 — GSC state (automated first, manual fallback)
```
node scripts/gsc-api-inspect.cjs <url> [--site-url <property>]
```
If this returns `automated: true`, you have live `verdict`, `coverageState`,
`lastCrawlTime`, `crawledAs`, `pageFetchState`, `robotsTxtState`,
`indexingState`, `userCanonical`, `googleCanonical`, `referringUrls`,
`sitemap` directly from Google — use it as `CURRENT_STATE` evidence, no need
to ask the user for anything for this phase. Optionally cross-check actual
submitted-sitemap status with `node scripts/gsc-api-list-sitemaps.cjs <siteUrl>`
or `node scripts/gsc-api-get-sitemap.cjs <siteUrl> <sitemapPath>` for one
specific sitemap (prefer `.get()` — `.list()` has been observed to omit
sitemaps; see the caveat in `scripts/lib/gsc-api-client.cjs`).

If it returns `automated: false` (no service account configured), ask the
user to paste URL Inspection output, a screenshot's text, or a CSV row for
this URL instead. Record the same fields from whatever they provide, and
mark any field still missing as `GSC EVIDENCE NOT AUTOMATED`.

Either way: calculate crawl age against today's date (e.g. "Last crawl
2026-06-27, investigation 2026-07-10 → crawl age 13 days").

## Phase 3 — Live fetch as Googlebot
```
node scripts/fetch-as-googlebot.cjs <url> --save-dir reports/gsc-indexing-debugger/raw
```
Records redirect chain, final URL, status, content-type/length, server, date,
age, cache-control, etag, x-cache and any CDN-specific headers, plus a
content hash. **Do not assume HTTP 200 = healthy** — it may be a raw SPA
shell, wrong entity, stale prerender, soft 404, duplicate content, or
incomplete render.

## Phase 4 — Stability
```
node scripts/check-stability.cjs <url> --count 10        # default
node scripts/check-stability.cjs <url> --count 20         # suspected intermittent issue
```
Low concurrency (sequential + delay) by design — do not send excessive
production traffic. If hashes vary, inspect the representative differing
responses to decide `INTERMITTENT_RAW_SHELL` vs `INTERMITTENT_WRONG_ENTITY`
vs `UNKNOWN_VARIANCE`.

## Phase 5 — Identity signals
```
node scripts/extract-signals.cjs --url <url>
```
Title, canonical (+ count), meta description, H1, OG/Twitter tags, robots,
hreflang, JSON-LD (`@context`/`@type`/`@id`/`url`/`name`/`description`/
`mainEntity`/`breadcrumb`/`image`/`sameAs`). Distinguish `IDENTITY_BUG` (e.g.
JSON-LD `@id` pointing to another entity) from `QUALITY_WEAKNESS` (e.g.
generic description shared by many pages — only escalate to a bug if main
content is also near-duplicate).

## Phase 6 — Visible content
```
node scripts/extract-visible-text.cjs --url <url>
```
Whole-string extraction (not line-based) so it works even on a single-line
prerendered document. Gives visible word count, normalized text hash, first
meaningful content lines.

## Phase 7 — Compare with Google-selected canonical (Mode 2 / when relevant)
```
node scripts/compare-pages.cjs <affectedUrl> <googleSelectedCanonicalUrl>
```
Produces comparison **facts** (title/canonical/H1/image equality, word-count
diff, normalized-text Jaccard similarity) — you then classify
`IDENTICAL`/`NEAR_IDENTICAL`/`STRUCTURALLY_SIMILAR_CONTENT_DISTINCT`/
`CLEARLY_DISTINCT` from those facts per `references/classification-guide.md`.
Never classify from byte size, shared template, or shared image alone.

## Phase 8 — Sitemap
```
node scripts/check-sitemap.cjs <url> [--family <slug>] [--also <canonicalUrl>]
```
Discovers the sitemap index (default `<origin>/sitemap.xml` — configurable
via `sitemapIndexPath` in the config file) and checks the matching child
sitemap for both URLs. Some sites have "prefix-less" entity routes that
don't match any documented naming scheme — pass `--family` explicitly if the
script reports `ambiguousPrefixless: true` and you know which one; otherwise
it safely full-scans every plausible child sitemap rather than guessing.

## Phase 9 — Internal links
Check whether the affected page and its related pages have crawlable
`<a href>` links (not just `onClick`) back to each other. A GSC "referring
page" is `HISTORICAL_GSC_REFERRING_PAGE` evidence, not proof a link exists in
current HTML — don't conflate the two. If an internal-link gap affects both
the affected URL and the selected canonical equally, it doesn't explain why
Google preferred one over the other (see the worked example).

## Phase 10 — Timeline (mandatory)
Build an explicit dated timeline from GSC crawl times + live-test dates. If
GSC state is old, current live page is clean/stable with correct identity
signals, and the bug can't be reproduced now → lean `STALE_GSC_STATE` /
`WAITING_FOR_RECRAWL`, not a code change.

## Phase 11 — Classify
Exactly one primary classification from `references/classification-guide.md`,
plus optional secondary findings (never presented as root cause without
evidence).

## Phase 12 — Likely owner
Assign with reasoning, using the worked example's reasoning as a model (e.g.
`STALE_GSC_STATE` → "Google stale state / no current code owner" → wait for
recrawl, no code patch).

# OUTPUT

Produce both:
1. A Markdown report following `templates/report-template.md` exactly.
2. A JSON evidence object following `templates/evidence-schema.json` (use
   only the enum values listed in its `_meta.enums`).

Save both under `reports/gsc-indexing-debugger/<slug>-<date>.md` /
`.json`. Every conclusion carries a confidence tag: `CONFIRMED`,
`STRONGLY_SUPPORTED`, `POSSIBLE`, `NOT_REPRODUCIBLE`, or `UNKNOWN`.
