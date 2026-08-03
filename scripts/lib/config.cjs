'use strict';
/**
 * Optional per-deployment configuration — lets this skill work out of the box
 * on any site without editing scripts. Missing file → sensible empty
 * defaults (everything still works, just without site-specific shortcuts
 * like auto-guessing a Domain-property siteUrl or clustering by known route
 * prefixes).
 *
 * Shape (see gsc-indexing-debugger.config.example.json):
 * {
 *   "siteUrl": "sc-domain:example.com",     // default Search Console property
 *   "domain": "example.com",                 // used to auto-guess siteUrl from any URL passed in
 *   "sitemapIndexPath": "/sitemap.xml",       // where your sitemap index lives (default: /sitemap.xml)
 *   "routeFamilies": ["blog", "docs"]         // optional: known URL-prefix route
 * }                                             families for smarter sitemap/export clustering
 */
const fs = require('fs');
const path = require('path');

const DEFAULTS = { siteUrl: null, domain: null, sitemapIndexPath: '/sitemap.xml', routeFamilies: [] };

function loadConfig(explicitPath) {
  const configPath = explicitPath
    || process.env.GSC_DEBUGGER_CONFIG_PATH
    || path.join(__dirname, '..', '..', 'gsc-indexing-debugger.config.json');
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULTS, configPath, configured: false };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      siteUrl: parsed.siteUrl || null,
      domain: parsed.domain || null,
      sitemapIndexPath: parsed.sitemapIndexPath || DEFAULTS.sitemapIndexPath,
      routeFamilies: Array.isArray(parsed.routeFamilies) ? parsed.routeFamilies : [],
      configPath,
      configured: true,
    };
  } catch (e) {
    return { ...DEFAULTS, configPath, configured: false };
  }
}

module.exports = { loadConfig };
