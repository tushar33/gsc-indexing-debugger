'use strict';
/**
 * Minimal Google Search Console API client — service-account auth (JWT
 * bearer grant) implemented with Node's built-in `crypto`/`https` only, no
 * `googleapis`/`google-auth-library` dependency. Read-only scope is
 * hardcoded so this client can never be used to mutate Search Console state
 * even if the service account is accidentally granted broader access.
 *
 * Credentials are never printed or embedded in any output — only the access
 * token is held in memory for the duration of one request.
 */
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function sitemapsUrl(siteUrl) {
  return `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`;
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// One well-known, gitignored secrets location at the repo root — override
// with GSC_SERVICE_ACCOUNT_KEY_PATH if you keep it elsewhere.
function defaultKeyPath() {
  return path.join(__dirname, '..', '..', '.gsc-service-account.json');
}

function loadServiceAccountCredentials(explicitPath) {
  const keyPath = explicitPath || process.env.GSC_SERVICE_ACCOUNT_KEY_PATH || defaultKeyPath();
  if (!fs.existsSync(keyPath)) {
    return { configured: false, keyPath };
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  } catch (e) {
    throw new Error(`GSC service account key at ${keyPath} is not valid JSON: ${e.message}`);
  }
  if (!json.client_email || !json.private_key) {
    throw new Error(`GSC service account key at ${keyPath} is missing client_email or private_key`);
  }
  return { configured: true, keyPath, clientEmail: json.client_email, privateKey: json.private_key };
}

function httpsPostForm(url, formObj) {
  return new Promise((resolve, reject) => {
    const body = Object.entries(formObj)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const { hostname, pathname, search } = new URL(url);
    const req = https.request(
      {
        hostname,
        path: pathname + search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try { json = JSON.parse(text); } catch (e) { json = { _raw: text }; }
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode} from ${hostname}: ${JSON.stringify(json)}`));
          resolve(json);
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsRequestJson(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, search } = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({ hostname, path: pathname + search, method, headers: reqHeaders }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = JSON.parse(text); } catch (e) { json = { _raw: text }; }
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode} from ${hostname}${pathname}: ${JSON.stringify(json)}`));
        resolve(json);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function signJwt({ clientEmail, privateKey }, scope) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: clientEmail,
    scope,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  const signatureUrl = signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${signingInput}.${signatureUrl}`;
}

async function getAccessToken(credentials, scope = READONLY_SCOPE) {
  const assertion = signJwt(credentials, scope);
  const res = await httpsPostForm(TOKEN_URL, {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  if (!res.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(res)}`);
  return res.access_token;
}

/**
 * Search Console URL Inspection API — the automated source for Phase 2
 * evidence (verdict, coverageState, lastCrawlTime, crawledAs, pageFetchState,
 * robotsTxtState, indexingState, userCanonical, googleCanonical, referring
 * URLs, sitemap membership as Google itself sees it).
 */
async function inspectUrl(credentials, { inspectionUrl, siteUrl, languageCode }) {
  const accessToken = await getAccessToken(credentials, READONLY_SCOPE);
  return httpsRequestJson(INSPECT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { inspectionUrl, siteUrl, ...(languageCode ? { languageCode } : {}) },
  });
}

/**
 * Search Console (legacy Webmasters v3) sitemaps.list — actual submitted-sitemap status.
 * CAUTION: observed in practice (on a real production site) to omit some
 * real sitemaps entirely — returned only a handful of a much larger set of
 * child sitemaps, all showing warnings: "0", while sitemaps.get() on an
 * omitted one showed real non-zero warnings. Do not treat a sitemap's
 * absence from .list() as "no warnings" — cross-check specific sitemaps
 * with getSitemap() below when precision matters.
 */
async function listSitemaps(credentials, siteUrl) {
  const accessToken = await getAccessToken(credentials, READONLY_SCOPE);
  return httpsRequestJson(sitemapsUrl(siteUrl), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Search Console sitemaps.get — full stats (including warnings/errors) for one specific sitemap path.
 * CAUTION (confirmed in production use): the `warnings` count this returns
 * can disagree with the Search Console UI's own sitemap detail page for the
 * IDENTICAL `lastDownloaded` run — observed the API reporting a large
 * nonzero warning count while the UI's detail view (not just the summary
 * row) showed 0, with no change in `lastDownloaded` between checks. Treat a
 * non-zero `warnings` count from this API as "needs UI confirmation before
 * treating as a live, actionable issue" — it is not reliably authoritative
 * on its own.
 */
async function getSitemap(credentials, siteUrl, feedpath) {
  const accessToken = await getAccessToken(credentials, READONLY_SCOPE);
  return httpsRequestJson(`${sitemapsUrl(siteUrl)}/${encodeURIComponent(feedpath)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

module.exports = {
  READONLY_SCOPE,
  loadServiceAccountCredentials,
  getSitemap,
  getAccessToken,
  inspectUrl,
  listSitemaps,
};
