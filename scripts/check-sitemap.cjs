#!/usr/bin/env node
'use strict';
/**
 * Phase 8 — check sitemap membership for a URL.
 *
 * Discovers the sitemap index (default `<origin>/sitemap.xml` — override via
 * config `sitemapIndexPath` if your site serves it elsewhere, e.g.
 * `/sitemaps/sitemap.xml`). Then locates and checks the child sitemap
 * matching the URL's route family so we never conclude "missing from
 * sitemap" from the index alone.
 *
 * IMPORTANT: don't trust a documented routing scheme to name the sitemap
 * family with certainty — actual production URLs can drift from what docs
 * say (prefixes get added/removed over time). When a --family isn't given
 * and the URL has no recognized prefix (from config `routeFamilies`), this
 * script checks EVERY discovered child sitemap rather than guessing from a
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
  const childSitemaps = extractLocs(indexRes.body);

  const family = args.family || guessFamily(url, config.routeFamilies);

  // Fast path: a named/guessed family checks exactly one sitemap.
  // Ambiguous path: no reliable family — scan every plausible child sitemap
  // rather than guessing, so absence is evidence, not an assumption.
  const sitemapsToCheck = family
    ? childSitemaps.filter((loc) => loc.includes(`/${family}/`))
    : childSitemaps.filter((loc) => !EXCLUDE_FROM_FULL_SCAN.some((x) => loc.includes(x)));

  const urlsToFind = args.also ? [url, args.also] : [url];
  const occurrences = {};
  const foundIn = {};
  for (const u of urlsToFind) { occurrences[u] = 0; foundIn[u] = []; }

  const checked = [];
  for (const sitemapUrl of sitemapsToCheck) {
    const childRes = await fetchText(sitemapUrl);
    const locs = extractLocs(childRes.body);
    checked.push({ sitemapUrl, urlCount: locs.length });
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
    discoveredChildSitemaps: childSitemaps,
    familyGuess: family,
    ambiguousPrefixless: !family,
    scanMode: family ? 'single-family' : 'full-scan-excluding-non-entity-sitemaps',
    childSitemapsChecked: checked,
    occurrences,
    foundIn,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
