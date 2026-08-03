# gsc-indexing-debugger

A [Claude Code](https://claude.com/claude-code) skill that diagnoses Google
Search Console indexing issues — wrong canonical selected, "Crawled -
currently not indexed", duplicate-content flags, sitemap warnings, and more —
using evidence collected from your actual live site and (optionally) the
real Search Console API, instead of assumptions in a ticket.

**Read-only by default. Never modifies application code or requests
indexing without your explicit approval.**

## Why this exists

Reported indexing issues are usually accompanied by a plausible-sounding
theory about the cause. That theory is often wrong, or only partially right,
or already resolved by the time anyone looks — Google Search Console data is
frequently stale, and its own API and UI can disagree with each other. This
tool encodes an evidence-first workflow: reproduce the current state, gather
fresh evidence from multiple independent sources, build a timeline, and only
then classify and recommend — instead of jumping straight from "ticket says
bug" to "change code."

## Install

Drop this into any project as a Claude Code skill:

```bash
# from your project root
git clone https://github.com/<your-org>/gsc-indexing-debugger.git .claude/skills/gsc-indexing-debugger
```

(Or `git submodule add` if you want to track updates. Or just copy the
folder if you don't need to pull upstream changes.)

If your project already uses a different skill convention (e.g. a
`skills/` folder + `.claude/commands/` symlinks), place `SKILL.md` wherever
your convention expects it and adjust the relative paths to `scripts/`/
`references/`/`templates/` accordingly — everything in this repo resolves
paths relative to `SKILL.md`'s own location.

No `npm install` needed — every script is plain Node using only built-in
modules (`https`, `crypto`, `fs`).

## Configure (optional, but recommended)

```bash
cp gsc-indexing-debugger.config.example.json gsc-indexing-debugger.config.json
```

Fill in your domain, Search Console property type, sitemap location, and
(optionally) known URL-prefix route families for smarter clustering. Every
field is optional — the tool works with zero configuration, just with less
site-specific shortcut behavior (e.g. it'll ask which Search Console
property to use instead of guessing, and it'll full-scan sitemaps instead of
jumping straight to the right one).

## Use it

In Claude Code, either type `/gsc-indexing-debugger` (if your setup wires it
up as a slash command) or just describe the investigation naturally:

**Single URL:**
```
Use the gsc-indexing-debugger skill to investigate:
https://www.example.com/some-page
Do not modify code.
```

**URL + Google-selected canonical:**
```
Affected URL: https://www.example.com/page-a
Google-selected canonical: https://www.example.com/page-b
```

**Bulk CSV export:** attach/paste a GSC Pages-report export and say "in bulk
mode" — it clusters and shows you a sampling plan *before* deep-diving
anything, and waits for your approval.

**Follow-up verification:**
```
Recheck the previous investigation for /some-page — has Google recrawled it yet?
```

Full phase-by-phase workflow: `SKILL.md`.

## GSC API setup (optional)

Without this, GSC evidence is manual — paste URL Inspection text,
screenshots, or CSV exports, and the tool works fine either way. Set this up
if you want it to pull fresh Search Console state automatically.

**What it needs:** a Google Cloud service account with **read-only**
`webmasters.readonly` scope. No new dependency required — the client
(`scripts/lib/gsc-api-client.cjs`) signs the JWT and calls the REST API
using only `crypto`/`https`.

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or
   reuse) a project, then **IAM & Admin → Service Accounts → Create Service
   Account**. No project-level roles needed — access is granted inside
   Search Console instead (step 4).
2. Enable the **Search Console API** for that project (APIs & Services →
   Library).
3. On the service account, **Keys → Add Key → Create new key → JSON**.
   Download it.
4. In [Search Console](https://search.google.com/search-console) → your
   property → **Settings → Users and permissions → Add user** → paste the
   service account's `client_email` (from the JSON key) → grant
   **Restricted** (read-only) access. Only an existing Owner on the property
   can do this. This is what actually limits what the key can see — the
   OAuth scope requested is also hardcoded read-only as a second layer.
5. Save the downloaded JSON key as `.gsc-service-account.json` at the repo
   root (already gitignored — never commit it), or point
   `GSC_SERVICE_ACCOUNT_KEY_PATH` at wherever you keep it.
6. If your property is a **Domain property**, set `"domain"` in your config
   file (or pass `--site-url sc-domain:example.com` / set `GSC_SITE_URL`) —
   otherwise the scripts default to guessing the URL-prefix form.

```bash
node scripts/gsc-api-inspect.cjs https://www.example.com/some-page
node scripts/gsc-api-get-sitemap.cjs sc-domain:example.com https://www.example.com/sitemap.xml
```

If no key is found, scripts print `{ "automated": false, ... }` instead of
failing — the workflow falls back to manual GSC input automatically.

**Key rotation:** if a key is ever pasted into chat/email/Slack rather than
copied file-to-file, treat it as exposed and rotate it immediately.

## Scripts

| Script | Purpose |
|---|---|
| `fetch-as-googlebot.cjs` | Fetch a URL with a Googlebot UA; records redirects, status, headers, content hash |
| `check-stability.cjs` | Repeat-fetch a URL to test prerender/response stability |
| `extract-signals.cjs` | Extract title/canonical/meta/OG/JSON-LD/robots/hreflang |
| `extract-visible-text.cjs` | Extract visible text + word count + hash, robust to single-line HTML |
| `compare-pages.cjs` | Deterministic comparison facts between two URLs (no classification) |
| `check-sitemap.cjs` | Confirm sitemap membership via the real sitemap index |
| `parse-gsc-export.cjs` | Cluster a bulk GSC CSV export for representative sampling |
| `gsc-api-inspect.cjs` | Call the real Search Console URL Inspection API (needs a service account) |
| `gsc-api-list-sitemaps.cjs` | Call sitemaps.list (aggregate — see caveat in `lib/gsc-api-client.cjs`) |
| `gsc-api-get-sitemap.cjs` | Call sitemaps.get for one specific sitemap — more reliable than `.list()` |

Run any of them directly, e.g.:
```bash
node scripts/fetch-as-googlebot.cjs https://www.example.com/some-page
```

## Coverage — which "Page indexing" issues this actually handles

Google Search Console's Page indexing report groups issues into a fixed set
of categories. Honest breakdown after actually stress-testing every category
against a real production site (not just checking the mechanics exist):

| GSC category | Coverage |
|---|---|
| Crawled - currently not indexed | ✅ Proven — the core motivating use case |
| Excluded by 'noindex' tag | ✅ Proven — checks live meta-robots + `X-Robots-Tag` directly against GSC's claim |
| Duplicate, Google chose different canonical than user | ✅ Proven — `compare-pages.cjs` was built specifically for this |
| Soft 404 | ✅ Proven — detects HTTP 200 pages actually serving 404-shaped content |
| Page with redirect | ✅ Mechanics proven (3 real live redirect chains captured correctly) — but never caught a live URL Google *itself* currently classifies as this specific category; every candidate had already settled into a different/stale status by the time it was checked |
| Server error (5xx) | ✅ Detection mechanics proven — status capture and `check-stability.cjs`'s stable-vs-intermittent classification both confirmed correct against a safe external test endpoint. Not tested against a real production 5xx, deliberately — provoking real server errors on a live site isn't appropriate stress-testing |
| Not found (404) | ✅ Proven — verified against a real GSC Coverage Drilldown export for this exact status (392 affected URLs). An earlier version of this README claimed the origin project's site was "structurally incapable of returning a true 404" (a CDN 200-fallback) — that claim was wrong (or the site's behavior changed since it was written) and has been corrected here: `fetch-as-googlebot.cjs` correctly captured a genuine raw HTTP 404 on 10 of 11 sampled URLs freshly crawled by Google in the last ~10 days, across 3 different path families. The 1 exception, plus 4/4 sampled from an older (~3-month-stale) crawl batch, returned 200 — a normal stale-GSC-data pattern (content since restored/fixed), not a tool or site limitation |
| Discovered - currently not indexed | ✅ Proven — verified against a real GSC Coverage Drilldown export for this exact status (thousands of affected URLs). Also surfaced and fixed a real bug in `check-sitemap.cjs`: it only followed one level of sitemap nesting, so on a site with a deeper sitemap-of-sitemaps structure it mistook a nested index's own `<sitemap>` entries for real page URLs and never reached the actual leaf urlsets. Now recurses to arbitrary depth; re-verified against a real affected URL — confirmed present in the sitemap (`sitemap-1.xml` of 10 paginated leaf sitemaps) and never crawled, exactly matching GSC's claim |
| Duplicate without user-selected canonical | ⚠️ Attempted against a real GSC Coverage Drilldown export for this exact status (999 affected URLs) — sampled 9 across the export (oldest and most-recent `lastmod`, spread across all 3 affected path families). Result: 2 now 404 (content removed since GSC last crawled them in May/June — a stale classification, not a live duplicate-canonical issue), the other 7 already have a valid, correctly-targeted canonical tag live right now. No currently-reproducible example found on this site; sites without consistent canonical tagging should find this easier to hit |
| Alternate page with proper canonical tag | ℹ️ Not really a "problem" — this GSC status means canonical handling is already working correctly; the tool confirms `HEALTHY` quickly rather than investigating |

The remaining ⚠️ "no live example found" row isn't a gap in the tool so much
as "this particular site didn't have an example lying around" — the
underlying evidence-gathering (live fetch, canonical extraction) is the same
proven machinery used everywhere else. If you hit this category on your own
site, it should work the same way the ✅ rows do — a PR adding that
real example to `references/examples/` would close the loop for the next
person.

## What it does NOT do

- Does not modify application code.
- Does not request indexing without your explicit approval.
- Does not deep-investigate every URL in a bulk export — it clusters first
  and waits for approval before deep-diving representatives.
- Does not assume the frontend (or any one repo) owns every issue —
  classifies likely ownership honestly across frontend/backend/prerender/
  CDN/CMS/sitemap-generation/Google-side.

## Known GSC quirks this tool has hit in production (and works around)

- **The Search Console UI can show an inflated "Indexed pages" count that
  corrects sharply later** — not a real overnight loss of indexed pages,
  a reporting lag/catch-up. Cross-check any dramatic UI-graph swing against
  an independent measurement (e.g. a stratified URL-Inspection sample)
  before treating it as a real regression.
- **`sitemaps.list()` can omit real sitemaps entirely** from its response
  (and their warning counts with them). Use `gsc-api-get-sitemap.cjs` for a
  specific sitemap when precision matters.
- **`sitemaps.get()`'s `warnings` count can disagree with the Search Console
  UI's own sitemap detail page** for the identical processing run. Don't
  treat a non-zero API warning count as a confirmed live issue without
  checking the UI detail page directly.
- **GSC's exported "affected URL" lists are point-in-time snapshots** — a
  meaningful share of any export has often already resolved by the time you
  recheck it live. Always re-verify before recommending a fix.
- **Your own CDN may make real 404s impossible to observe.** A common SPA
  deployment pattern (CloudFront/S3, or equivalent) rewrites every
  origin-level error into an HTTP 200 fallback so client-side routing can
  handle it. That means Googlebot can never actually receive a genuine 404 —
  everything degrades to a soft-404 or an unstyled fallback shell instead.
  Check `fetch-as-googlebot.cjs` against a deliberately-nonexistent static
  asset path on your own site before assuming "Not found (404)" is even a
  reachable category for you.

## Output

Each investigation produces a Markdown report (`templates/report-template.md`
shape) plus a JSON evidence file (`templates/evidence-schema.json` shape),
saved under `reports/` (gitignored — never committed, though you can copy a
report elsewhere for a ticket if you want to).

## License

MIT — see [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
