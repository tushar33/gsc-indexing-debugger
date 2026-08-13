# Changelog

## Unreleased

- Added `gsc-api-position-movers.cjs` and a paginating
  `querySearchAnalyticsAll()` helper on `lib/gsc-api-client.cjs` (the
  Search Analytics `query.rowLimit` API cap is 25,000/request —
  `querySearchAnalyticsAll` pages through `startRow` until a page returns
  fewer than the max, so results reflect the full ranked-page set, not a
  silently truncated top-N). The new script compares two date ranges by
  page or query and reports `worsened`/`improved` position deltas plus
  `vanished` (had traffic in period A, zero in period B) and `brandNew`
  (the reverse) — surfaced on a real production site that `vanished`
  often matters more than any position-number delta: a 2-period diff on
  tuliresearchcentre.org found 303 pages that dropped out of the ranked
  set entirely (79,839 lost impressions), where a naive top-N-sampled
  comparison would have missed the majority of them and understated the
  site-wide impact. That same investigation traced 58.7% of the vanished
  impressions to one specific duplicate-URL pattern (a film
  `cast-credit`/`credit-cast` legacy-alias route both independently
  ranking despite an identical declared canonical) — confirming the
  vanished/brandNew lists catch real, actionable technical findings that
  a same-page-both-periods delta comparison structurally cannot.
- Added `gsc-api-average-position.cjs` and a `querySearchAnalytics()`
  function on `lib/gsc-api-client.cjs`, calling the Search Console Search
  Analytics API (same read-only service account as the other `gsc-api-*`
  scripts). Reports average position/clicks/impressions/CTR grouped by
  date, optionally filtered to one page and/or one exact query, plus a
  simple and impression-weighted average-position summary across the
  range. This is ranking/traffic evidence, not an indexing-state check —
  documented as optional supplementary evidence for Phase 10 (Timeline),
  not a new required phase. Verified end-to-end against a real production
  GSC property.
- Added `X-Robots-Tag` response-header checking to `extractSignals()`
  (`extract-signals.cjs`, `compare-pages.cjs`). Previously only checked the
  meta `robots` tag from the HTML -- a page can have a perfectly clean meta
  tag while still being excluded via a noindex directive set at the CDN/edge
  layer (e.g. a response header added by a Lambda@Edge function), which was
  invisible to this skill. New `xRobotsTag` (raw header value) and `noindex`
  (combined boolean, true if either source says noindex) fields on the
  signals object. Surfaced while investigating a real "Excluded by noindex
  tag" validation-failure batch on the origin project.
- Fixed `check-sitemap.cjs` to recurse through sitemap nesting of arbitrary
  depth. It previously assumed exactly one level of indirection between the
  top-level index and real leaf urlsets; on a site with a deeper
  sitemap-of-sitemaps structure (index → a second index → 35+ per-route
  leaf sitemaps, verified on a real production site), it mistook a nested
  index's own `<sitemap>` entries for real page URLs and never reached the
  actual leaves — silently reporting "not found" for URLs that genuinely
  were in the sitemap. Now distinguishes `<sitemapindex>` from `<urlset>`
  at every level and recurses until it hits real leaves.
- Verified "Discovered - currently not indexed" coverage against a real GSC
  Coverage Drilldown export, upgrading it from "no live example found" to
  proven — this is what surfaced the sitemap-recursion bug above.
- Re-verified "Duplicate without user-selected canonical" against a second
  real GSC Coverage Drilldown export (999 affected URLs). Sampled 9 across
  the export using `extract-signals.cjs`: 2 now 404 (content removed since
  GSC's last crawl — a stale classification), the other 7 already have a
  valid, correctly-targeted canonical live. No currently-reproducible
  example found; strengthens the existing caveat with real evidence instead
  of overturning it.
- **Corrected an inaccurate claim**: the README previously stated the origin
  project's site was "structurally incapable of returning a true 404" (a
  CDN 200-fallback). Re-verified against a real GSC "Not found (404)"
  Coverage Drilldown export (392 affected URLs) — `fetch-as-googlebot.cjs`
  correctly captured a genuine raw HTTP 404 on 10 of 11 sampled URLs freshly
  crawled by Google in the last ~10 days, across 3 path families. The prior
  claim was wrong (or the site's behavior changed since it was written).
  Upgraded from "genuinely can't be tested on some sites" to proven.

## 1.0.0 — Initial open-source release

Extracted and generalized from a project-specific Claude Code skill built for
diagnosing a real Google Search Console indexing escalation. Decoupled from
the origin project's hardcoded domain and route-naming conventions into an
optional `gsc-indexing-debugger.config.json`.

- Evidence-first diagnostic workflow (12 phases): capture → GSC state →
  live fetch → stability → identity signals → visible content → comparison →
  sitemap → internal links → timeline → classify → assign owner.
- 5 input modes: single URL, URL + canonical, URL list, bulk CSV, follow-up
  verification.
- Automated Search Console API integration (URL Inspection, sitemaps list/get)
  via a from-scratch JWT/OAuth client — zero npm dependencies.
- Manual-evidence fallback when no service account is configured.
- Full classification taxonomy (18 primary classifications) with a
  documented confidence standard (`CONFIRMED`/`STRONGLY_SUPPORTED`/
  `POSSIBLE`/`NOT_REPRODUCIBLE`/`UNKNOWN`).
- Known-caveats documentation for real GSC API quirks discovered in
  production use (`.list()` omitting sitemaps; API/UI warning-count
  disagreement).
