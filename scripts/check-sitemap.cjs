#!/usr/bin/env node
'use strict';
/**
 * Phase 8 — check sitemap membership for a URL.
 *
 * Discovers the sitemap index (default `<origin>/sitemap.xml` — override via
 * config `sitemapIndexPath` if your site serves it elsewhere, e.g.
 * `/sitemaps/sitemap.xml`). Sitemap nesting depth varies by site — some
 * serve one flat index of leaf urlsets, others nest a sitemap-of-sitemaps
 * multiple levels deep (verified on a real production site: index → a
 * second index → 35+ per-route-family leaf urlsets). `resolveLeafSitemaps`
 * below distinguishes `<sitemapindex>` (more nesting to follow) from
 * `<urlset>` (real page URLs) at every level and recurses until it hits
 * real leaves, however deep that is — never assumes exactly one hop.
 *
 * IMPORTANT: don't trust a documented routing scheme to name the sitemap
 * family with certainty — actual production URLs can drift from what docs
 * say (prefixes get added/removed over time). When a --family isn't given
 * and the URL has no recognized prefix (from config `routeFamilies`), this
 * script checks EVERY discovered leaf sitemap rather than guessing from a
 * fixed list, so "not found in sitemap" is a real finding, not a false
 * negative from a stale assumption.
 *
 * Configure known route-family prefixes (optional, sharpens the fast path)
 * in gsc-indexing-debugger.config.json — see .config.example.json.
 *
 * Usage: node check-sitemap.cjs <url> [--family <slug>] [--also <otherUrl>]
 */
const { fetchAsGooglebot } = require('./lib/fetch-utils.cjs');
const { loadConfig } = require('./lib/config.cjs');

// Child sitemaps that are structurally never going to contain an entity
// landing-page URL (blog posts, paginated asset/media pages, etc). Skipped
// only when scanning ALL sitemaps in the ambiguous case, to keep that scan
// bounded — never used to skip a sitemap explicitly named via --family.
// Adjust to your own site's non-entity sitemap paths as needed.
const EXCLUDE_FROM_FULL_SCAN = [
  '/static/', '/posts/', '/blog/', '/videos/',
];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--family') args.family = argv[++i];
    else if (a === '--also') args.also = argv[++i];
    else args._.push(a);
  }
  return args;
}

function guessFamily(urlStr, routeFamilies) {
  const { pathname } = new URL(urlStr);
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  return firstSegment && routeFamilies.includes(firstSegment) ? firstSegment : null;
}

async function fetchText(url) {
  const res = await fetchAsGooglebot(url);
  return { finalUrl: res.finalUrl, status: res.httpStatus, body: res.body };
}

function extractLocs(xml) {
  const re = /<loc>([^<]+)<\/loc>/gi;
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

// True if this document is itself an index of further sitemaps (more
// nesting below it), false if it's a leaf urlset of real page <url> entries.
function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * Recursively walks a sitemap tree of arbitrary depth and returns only the
 * real leaf sitemaps (urlsets) reachable from `startUrl`, each with its
 * actual page-URL `locs`. Never treats an index's nested `<sitemap>` entries
 * as page URLs, however many levels of indirection are in between.
 *
 * Family filtering is applied at EVERY level, not just the top: if none of
 * an index's children match `/${familyFilter}/` at this level, that split
 * likely happens deeper (e.g. a top-level index with a single generic
 * pass-through child) — fall back to expanding every child rather than
 * concluding the family doesn't exist here.
 *
 * @returns {Promise<Array<{sitemapUrl: string, urlCount: number, locs: string[]}>>}
 */
async function resolveLeafSitemaps(startUrl, { familyFilter, exclude, visited = new Set(), depth = 0 } = {}) {
  const MAX_DEPTH = 6; // guards against a circular/malformed sitemap graph
  if (depth > MAX_DEPTH || visited.has(startUrl)) return [];
  visited.add(startUrl);

  const res = await fetchText(startUrl);
  const locs = extractLocs(res.body);

  if (!isSitemapIndex(res.body)) {
    return [{ sitemapUrl: startUrl, urlCount: locs.length, locs }];
  }

  let toExpand = familyFilter
    ? locs.filter((loc) => loc.includes(`/${familyFilter}/`))
    : locs.filter((loc) => !exclude.some((x) => loc.includes(x)));
  if (familyFilter && toExpand.length === 0) toExpand = locs;

  const results = [];
  for (const child of toExpand) {
    results.push(...await resolveLeafSitemaps(child, { familyFilter, exclude, visited, depth: depth + 1 }));
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args._[0];
  if (!url) {
    console.error('Usage: node check-sitemap.cjs <url> [--family <slug>] [--also <otherUrl>]');
    process.exit(1);
  }
  const config = loadConfig();
  const origin = new URL(url).origin;
  const sitemapIndexPath = config.sitemapIndexPath || '/sitemap.xml';
  const indexUrl = `${origin}${sitemapIndexPath}`;
  const indexRes = await fetchText(indexUrl);
  const topLevelLocs = extractLocs(indexRes.body);

  const family = args.family || guessFamily(url, config.routeFamilies);

  // Fast path: a named/guessed family recurses toward just the matching
  // branch(es) of the sitemap tree, however deep the split occurs.
  // Ambiguous path: no reliable family — recursively expand every branch
  // not excluded as structurally non-entity, so absence is evidence, not
  // an assumption from stopping one level too early.
  const leafSitemaps = [];
  for (const child of topLevelLocs) {
    leafSitemaps.push(...await resolveLeafSitemaps(child, { familyFilter: family, exclude: EXCLUDE_FROM_FULL_SCAN }));
  }

  const urlsToFind = args.also ? [url, args.also] : [url];
  const occurrences = {};
  const foundIn = {};
  for (const u of urlsToFind) { occurrences[u] = 0; foundIn[u] = []; }

  for (const { sitemapUrl, locs } of leafSitemaps) {
    for (const u of urlsToFind) {
      const normalized = u.replace(/\/$/, '');
      const matches = locs.filter((l) => l.replace(/\/$/, '') === normalized).length;
      occurrences[u] += matches;
      if (matches > 0) foundIn[u].push(sitemapUrl);
    }
  }

  console.log(JSON.stringify({
    inputUrl: url,
    sitemapIndexUrl: indexUrl,
    indexHttpStatus: indexRes.status,
    topLevelSitemapEntries: topLevelLocs,
    familyGuess: family,
    ambiguousPrefixless: !family,
    scanMode: family ? 'single-family' : 'full-scan-excluding-non-entity-sitemaps',
    leafSitemapsChecked: leafSitemaps.map(({ sitemapUrl, urlCount }) => ({ sitemapUrl, urlCount })),
    occurrences,
    foundIn,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
