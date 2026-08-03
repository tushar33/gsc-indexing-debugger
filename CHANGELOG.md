# Changelog

## Unreleased

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
