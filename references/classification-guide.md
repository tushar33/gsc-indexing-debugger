# Classification Guide — gsc-indexing-debugger

Full taxonomy, classification rules, and confidence standard for the
`/gsc-indexing-debugger` skill. The main skill file points here instead of
duplicating this content inline.

## Primary classifications (use exactly one)

```
HEALTHY
ALREADY_RESOLVED
STALE_GSC_STATE
WAITING_FOR_RECRAWL
CURRENT_CROSS_CANONICAL_BUG
WRONG_ENTITY_PRERENDERED
PRERENDER_UNSTABLE
RAW_SPA_SHELL
REDIRECT_CONFLICT
SITEMAP_CONFLICT
NEAR_DUPLICATE_CONTENT
GENERIC_METADATA
GENERIC_IMAGE_FALLBACK
INTERNAL_LINK_SIGNAL_ISSUE
NOINDEX_OR_ROBOTS_CONFLICT
HTTP_STATUS_PROBLEM
SOFT_404
UNKNOWN_NEEDS_MANUAL_REVIEW
```

Allow secondary findings alongside the primary classification, but never
present a secondary finding as the root cause unless causation is supported
by direct evidence (see "Never" list below).

## Likely owner (assign one, with reasoning)

```
frontend
backend/API
prerender
CloudFront/infrastructure
CMS/content/data
sitemap generation
Google stale state / no current code owner
cross-system
unknown
```

Example ownership split from a real deployment: sitemap *generation* was
backend-owned (served dynamically, not built by the frontend), prerendering
was owned by a separate internal rendering service, and canonical/meta/
JSON-LD *generation* was frontend-owned (in the page-head/SEO components).
Map your own site's actual ownership boundaries here — the point is to be
honest about which repo/team/service is actually responsible before
assigning a fix, not to assume the frontend owns everything just because
this skill lives in a frontend repo.

## Classification rules

### HEALTHY
Current GSC and live state are both healthy. **Action:** no change.

### ALREADY_RESOLVED
A historical report said the URL was affected, but fresh GSC shows the page
indexed with the Google-selected canonical equal to the inspected URL.
**Action:** no code change; record the latest crawl and recovery.

### STALE_GSC_STATE
Stored Google state is based on an older crawl; current live page is clean,
stable, has the correct canonical and identity signals; the reported bug
cannot be reproduced. **Action:** consider a live test, consider an indexing
request with explicit approval, recheck after recrawl — no speculative code
change.

### WAITING_FOR_RECRAWL
Current live page is clean, indexing was already requested, Google has not
yet recorded a newer crawl. **Action:** monitor `lastCrawlTime`, compare
canonical after recrawl.

### CURRENT_CROSS_CANONICAL_BUG
Current live output points to another entity's URL. **Action:** identify the
exact current source, inspect relevant code, prepare a *separate* fix plan
(this skill does not implement fixes).

### WRONG_ENTITY_PRERENDERED
Entity A currently returns entity B's content or identity. **Action:**
investigate routing, data race, prerender readiness, cache key, shared-state
contamination.

### PRERENDER_UNSTABLE
Repeated requests produce inconsistent output. **Action:** preserve samples,
identify the pattern, locate the prerender/cache cause.

### RAW_SPA_SHELL
Googlebot sometimes or consistently receives the unrendered application
shell. **Action:** investigate prerender readiness and snapshot timing (if
your app uses a client-side-rendered SPA + prerender/snapshot service,
check the handshake between data-ready state and snapshot capture timing).

### NEAR_DUPLICATE_CONTENT
Use only when actual main-content comparison supports it — never from
generic metadata alone.

### INTERNAL_LINK_SIGNAL_ISSUE
Important entity relationships are not crawlable (text with `onClick` but no
`href`; object pages that don't crawlably link back to the parent entity).
Do not automatically claim this caused a canonical selection — it is a valid
finding on its own, not proof of causation.

### GENERIC_METADATA / GENERIC_IMAGE_FALLBACK
A generic description or OG image shared by many entities is a
`QUALITY_WEAKNESS`, not proof of duplication, unless the actual main content
is also near-duplicate.

### SITEMAP_CONFLICT / REDIRECT_CONFLICT / NOINDEX_OR_ROBOTS_CONFLICT / HTTP_STATUS_PROBLEM / SOFT_404
Use when live evidence directly shows the conflict (wrong sitemap entries,
redirect loop/mismatch, robots/noindex contradicting intent, non-200 status,
or a 200 response with no real content).

### UNKNOWN_NEEDS_MANUAL_REVIEW
Evidence is inconclusive or a required repo/data source is unavailable in the
current workspace. State exactly what is missing and the next check for the
relevant owner — do not guess.

## Content similarity classification (Phase 7)

```
IDENTICAL
NEAR_IDENTICAL
STRUCTURALLY_SIMILAR_CONTENT_DISTINCT
CLEARLY_DISTINCT
UNKNOWN
```

Never classify from only: byte size, generic description, shared layout,
shared navigation, or shared OG image. Use `compare-pages.cjs` output
(`normalizedTextJaccardSimilarity`, `wordCountDiff`, identity-signal equality)
as the evidence base.

## Response stability classification (Phase 4)

```
STABLE
SIZE_VARIANCE
HASH_VARIANCE
INTERMITTENT_RAW_SHELL
INTERMITTENT_WRONG_ENTITY
INTERMITTENT_HTTP_FAILURE
UNKNOWN_VARIANCE
```

`check-stability.cjs` deterministically buckets into `STABLE` /
`HASH_VARIANCE` / `SIZE_VARIANCE` / `INTERMITTENT_HTTP_FAILURE`. When hashes
vary, inspect the differing saved responses to decide whether it's actually
`INTERMITTENT_RAW_SHELL`, `INTERMITTENT_WRONG_ENTITY`, or truly
`UNKNOWN_VARIANCE` — that judgment is not automated.

## Confidence standard

Every important conclusion must use one of:

```
CONFIRMED
STRONGLY_SUPPORTED
POSSIBLE
NOT_REPRODUCIBLE
UNKNOWN
```

## Never

- Never say "root cause confirmed" without direct evidence.
- Never convert correlation into causation.
- Never recommend a code change only because: an old GSC crawl selected
  another canonical; pages share a description template; pages share an
  image; one page has more links; GSC lists a historical referring page.
- Never silently convert a ticket claim into a fact — tag every statement as
  `FACT`, `HYPOTHESIS`, `HISTORICAL_STATE`, or `CURRENT_STATE`.
