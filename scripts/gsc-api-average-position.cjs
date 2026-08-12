#!/usr/bin/env node
'use strict';
/**
 * Optional supplementary evidence for Phase 10 (Timeline) — average
 * position/clicks/impressions/CTR trend over time via Search Console
 * Search Analytics, not an indexing-state check. Useful for confirming a
 * position/impression recovery (or decline) around a fix or a reported
 * issue's date, alongside the crawl-time timeline the rest of this skill
 * already builds. Requires the same service account as gsc-api-inspect.cjs.
 *
 * Always grouped by date. Optionally narrow to one page and/or one exact
 * query with --page/--query; without either, results are site-wide.
 *
 * Usage:
 *   node gsc-api-average-position.cjs <siteUrl> [options]
 *
 *   siteUrl example: sc-domain:example.com (or https://www.example.com/)
 *
 * Options:
 *   --start YYYY-MM-DD   Default: 27 days before --end
 *   --end   YYYY-MM-DD   Default: today
 *   --page  <url>        Filter to one exact page URL
 *   --query <string>     Filter to one exact search query
 *   --key   <path>       Service account key path (see lib/gsc-api-client.cjs)
 *
 * Note: Search Console data typically lags 2-3 days — rows for the most
 * recent day(s) of the requested window may simply be absent, not an error.
 */
const { loadServiceAccountCredentials, querySearchAnalytics } = require('./lib/gsc-api-client.cjs');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--start') args.start = argv[++i];
    else if (a === '--end') args.end = argv[++i];
    else if (a === '--page') args.page = argv[++i];
    else if (a === '--query') args.query = argv[++i];
    else if (a === '--key') args.key = argv[++i];
    else args._.push(a);
  }
  return args;
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function defaultDateRange(startArg, endArg) {
  const end = endArg ? new Date(endArg) : new Date();
  const start = startArg ? new Date(startArg) : new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

function buildFilterGroups({ page, query }) {
  const filters = [];
  if (page) filters.push({ dimension: 'page', operator: 'equals', expression: page });
  if (query) filters.push({ dimension: 'query', operator: 'equals', expression: query });
  return filters.length ? [{ filters }] : undefined;
}

function summarize(rows) {
  if (!rows.length) {
    return { days: 0, totalClicks: 0, totalImpressions: 0, simpleAveragePosition: null, impressionWeightedAveragePosition: null };
  }
  let totalClicks = 0;
  let totalImpressions = 0;
  let positionSum = 0;
  let weightedPositionSum = 0;
  for (const row of rows) {
    totalClicks += row.clicks || 0;
    totalImpressions += row.impressions || 0;
    positionSum += row.position || 0;
    weightedPositionSum += (row.position || 0) * (row.impressions || 0);
  }
  return {
    days: rows.length,
    totalClicks,
    totalImpressions,
    simpleAveragePosition: Number((positionSum / rows.length).toFixed(2)),
    impressionWeightedAveragePosition: totalImpressions > 0
      ? Number((weightedPositionSum / totalImpressions).toFixed(2))
      : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const siteUrl = args._[0];
  if (!siteUrl) {
    console.error('Usage: node gsc-api-average-position.cjs <siteUrl> [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--page <url>] [--query <string>] [--key <path>]');
    console.error('siteUrl example: sc-domain:example.com  (or https://www.example.com/)');
    process.exit(1);
  }

  const creds = loadServiceAccountCredentials(args.key);
  if (!creds.configured) {
    console.log(JSON.stringify({
      automated: false,
      note: 'GSC EVIDENCE NOT AUTOMATED — no service account key found. See README.md for setup.',
      expectedKeyPath: creds.keyPath,
    }, null, 2));
    return;
  }

  const { startDate, endDate } = defaultDateRange(args.start, args.end);
  const dimensionFilterGroups = buildFilterGroups({ page: args.page, query: args.query });

  const result = await querySearchAnalytics(creds, siteUrl, {
    startDate,
    endDate,
    dimensions: ['date'],
    dimensionFilterGroups,
  });

  const rows = (result.rows || []).map((r) => ({
    date: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: Number(r.position.toFixed(2)),
  }));

  console.log(JSON.stringify({
    automated: true,
    siteUrl,
    startDate,
    endDate,
    filters: { page: args.page || null, query: args.query || null },
    rows,
    summary: summarize(rows),
    note: rows.length === 0
      ? 'No rows returned — either no traffic for this filter/range, or the most recent days have not yet landed in Search Console (typical 2-3 day lag).'
      : undefined,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ automated: true, error: err.message }));
  process.exit(1);
});
