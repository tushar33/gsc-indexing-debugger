# Case Study — Artist Indexing Escalation (Laxman Pai / Serbjeet Singh / K H Ara)

> **Note:** this is a real investigation from the project this tool was
> originally built for (tuliresearchcentre.org) — kept as a concrete,
> unmodified worked example rather than genericized into a hypothetical.
> Use it to calibrate what "evidence-first" output looks like, and as a
> regression check when changing the workflow. Not required reading to use
> the tool on your own site.

## Reported issue

- `https://www.tuliresearchcentre.org/laxman-pai`
- `https://www.tuliresearchcentre.org/serbjeet-singh`
- `https://www.tuliresearchcentre.org/k-h-ara`

**Original report (HYPOTHESIS, not fact):** Google treated Laxman Pai and
Serbjeet Singh as duplicates of K H Ara because all three had generic
templated content, a generic OG image fallback, and K H Ara was linked from
the homepage — so Google selected K H Ara as canonical.

## What live evidence actually showed

Repeated Googlebot-UA fetches produced **stable, distinct** hashes for all
three pages — they were not content-identical:

| Page | Size | Hash stability |
|---|---|---|
| Laxman Pai | 140,647 bytes | stable across repeats |
| Serbjeet Singh | 85,168 bytes | stable across repeats |
| K H Ara | 194,273 bytes | stable across repeats |

All three: HTTP 200, stable prerendered HTML, exactly one self-referencing
canonical, appeared exactly once in the person-artist sitemap, no current
cross-canonical references to each other.

## Timeline (the key evidence)

```
2026-06-27  Google last crawled Laxman Pai; selected K H Ara as canonical
2026-07-05  Google recrawled K H Ara; K H Ara became its own self-canonical
2026-07-08  Google recrawled Serbjeet Singh; recovered as self-canonical
2026-07-10  Fresh live test of Laxman Pai is clean, stable, correctly self-canonical
```

## Result

| Page | Primary classification | Google-selected canonical | Action |
|---|---|---|---|
| Serbjeet Singh | `ALREADY_RESOLVED` | inspected URL | no code change |
| K H Ara | `HEALTHY` | inspected URL | no code change |
| Laxman Pai (before indexing request) | `STALE_GSC_STATE` | | |
| Laxman Pai (after request, before new crawl) | `WAITING_FOR_RECRAWL` | | recheck after newer crawl; no speculative code change |

**Separate finding (not the cause of this canonical selection):**
`INTERNAL_LINK_SIGNAL_ISSUE` — object pages did not provide crawlable
`<a href>` links back to the artist masterlist page. This affected *both*
Laxman Pai's and K H Ara's object pages equally, so it does not explain why
Google preferred K H Ara specifically. Valid issue, logged separately.

## Key lesson

An old GSC result or ticket description is not proof of a current code bug.
The workflow is always:

```
reported GSC issue
→ reproduce current state
→ collect fresh Google state
→ collect current live evidence
→ compare timelines
→ classify
→ recommend action
```

Never: `ticket says bug → change code`.
