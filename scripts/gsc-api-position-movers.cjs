#!/usr/bin/env node
'use strict';
/**
 * Optional supplementary evidence for Phase 10 (Timeline) — compares
 * average position/impressions per page (or query) between two date
 * ranges via Search Analytics, and reports:
 *   - worsened: pages whose position got worse (number went up) in both periods
 *   - improved: pages whose position got better (number went down) in both periods
 *   - vanished: had real traffic in period A, zero rows at all in period B
 *   - brandNew: zero rows in period A, real traffic in period B
 *   - siteWide: impression-weighted average position for each period
 *
 * Uses querySearchAnalyticsAll (paginates past the 25,000-row API cap) so
 * results reflect the FULL ranked-page set for each period, not a sample —
 * on a large site this can be tens of thousands of rows and several API
 * calls per period.
 *
 * `vanished`/`brandNew` matter as much as (often more than) the worsened/
 * improved deltas: a page that drops out of both periods' comparison set
 * entirely (survivorship bias) can represent a bigger visibility loss than
 * any position-number change captured in `worsened`.
 *
 * Usage:
 *   node gsc-api-position-movers.cjs <siteUrl> \
 *     --a-start YYYY-MM-DD --a-end YYYY-MM-DD \
 *     --b-start YYYY-MM-DD --b-end YYYY-MM-DD \
 *     [--dimension page|query] [--min-impressions N] [--top N] [--key <path>]
 *
 *   siteUrl example: sc-domain:example.com (or https://www.example.com/)
 *
 * Options:
 *   --dimension       page (default) or query
 *   --min-impressions Minimum impressions required in BOTH periods for a row
 *                      to count toward worsened/improved (default 50) — filters
 *                      out noisy near-zero-traffic rows
 *   --top             How many rows to report per list (default 20)
 *   --key             Service account key path (see lib/gsc-api-client.cjs)
 */
const { loadServiceAccountCredentials, querySearchAnalyticsAll } = require('./lib/gsc-api-client.cjs');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--a-start') args.aStart = argv[++i];
    else if (a === '--a-end') args.aEnd = argv[++i];
    else if (a === '--b-start') args.bStart = argv[++i];
    else if (a === '--b-end') args.bEnd = argv[++i];
    else if (a === '--dimension') args.dimension = argv[++i];
    else if (a === '--min-impressions') args.minImpressions = Number(argv[++i]);
    else if (a === '--top') args.top = Number(argv[++i]);
    else if (a === '--key') args.key = argv[++i];
    else args._.push(a);
  }
  return args;
}

async function fetchByKey(creds, siteUrl, dimension, { startDate, endDate }) {
  const res = await querySearchAnalyticsAll(creds, siteUrl, { startDate, endDate, dimensions: [dimension] });
  const map = new Map();
  for (const row of res.rows || []) {
    map.set(row.keys[0], { key: row.keys[0], position: row.position, impressions: row.impressions, clicks: row.clicks });
  }
  return map;
}

function weightedAvg(map) {
  let posSum = 0, imprSum = 0;
  for (const v of map.values()) { posSum += v.position * v.impressions; imprSum += v.impressions; }
  return imprSum > 0 ? Number((posSum / imprSum).toFixed(2)) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const siteUrl = args._[0];
  if (!siteUrl || !args.aStart || !args.aEnd || !args.bStart || !args.bEnd) {
    console.error('Usage: node gsc-api-position-movers.cjs <siteUrl> --a-start YYYY-MM-DD --a-end YYYY-MM-DD --b-start YYYY-MM-DD --b-end YYYY-MM-DD [--dimension page|query] [--min-impressions N] [--top N] [--key <path>]');
    process.exit(1);
  }
  const dimension = args.dimension === 'query' ? 'query' : 'page';
  const minImpressions = Number.isFinite(args.minImpressions) ? args.minImpressions : 50;
  const top = Number.isFinite(args.top) ? args.top : 20;

  const creds = loadServiceAccountCredentials(args.key);
  if (!creds.configured) {
    console.log(JSON.stringify({
      automated: false,
      note: 'GSC EVIDENCE NOT AUTOMATED — no service account key found. See README.md for setup.',
      expectedKeyPath: creds.keyPath,
    }, null, 2));
    return;
  }

  const periodA = { startDate: args.aStart, endDate: args.aEnd };
  const periodB = { startDate: args.bStart, endDate: args.bEnd };
  const [mapA, mapB] = await Promise.all([
    fetchByKey(creds, siteUrl, dimension, periodA),
    fetchByKey(creds, siteUrl, dimension, periodB),
  ]);

  const moves = [];
  for (const [key, a] of mapA.entries()) {
    const b = mapB.get(key);
    if (!b) continue;
    if (a.impressions < minImpressions || b.impressions < minImpressions) continue;
    moves.push({
      key,
      positionA: a.position,
      positionB: b.position,
      delta: Number((b.position - a.position).toFixed(2)), // positive = worse
      impressionsA: a.impressions,
      impressionsB: b.impressions,
    });
  }
  moves.sort((x, y) => y.delta - x.delta);
  const worsened = moves.filter((m) => m.delta > 0);
  const improved = moves.filter((m) => m.delta < 0).slice().reverse();

  const vanished = [];
  for (const [key, a] of mapA.entries()) {
    if (a.impressions >= minImpressions && !mapB.has(key)) {
      vanished.push({ key, position: a.position, impressions: a.impressions });
    }
  }
  vanished.sort((x, y) => y.impressions - x.impressions);

  const brandNew = [];
  for (const [key, b] of mapB.entries()) {
    if (b.impressions >= minImpressions && !mapA.has(key)) {
      brandNew.push({ key, position: b.position, impressions: b.impressions });
    }
  }
  brandNew.sort((x, y) => y.impressions - x.impressions);

  console.log(JSON.stringify({
    automated: true,
    siteUrl,
    dimension,
    minImpressions,
    periodA,
    periodB,
    rowCountA: mapA.size,
    rowCountB: mapB.size,
    siteWideAveragePosition: { periodA: weightedAvg(mapA), periodB: weightedAvg(mapB) },
    qualifyingComparisons: moves.length,
    worsened: worsened.slice(0, top),
    improved: improved.slice(0, top),
    vanished: vanished.slice(0, top),
    vanishedTotalCount: vanished.length,
    vanishedTotalImpressions: vanished.reduce((s, v) => s + v.impressions, 0),
    brandNew: brandNew.slice(0, top),
    brandNewTotalCount: brandNew.length,
    note: `rowCountA/rowCountB reflect full pagination (no truncation), but worsened/improved/vanished/brandNew are each capped to --top (${top}) most-significant rows — see the *TotalCount fields for the untruncated totals.`,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ automated: true, error: err.message }));
  process.exit(1);
});
