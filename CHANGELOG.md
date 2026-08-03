# Changelog

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
