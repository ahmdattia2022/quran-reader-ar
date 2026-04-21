#!/usr/bin/env node
/**
 * Pings IndexNow (Bing, Yandex, Seznam) after deploy so they crawl immediately.
 * Google doesn't support IndexNow — for Google, submit sitemap in Search Console.
 * Run after each deploy: node scripts/ping-indexnow.mjs
 */
const HOST = 'quran-reader-ar.pages.dev';
const KEY = '9a8f2e5c4d1b3a7e6f0d9c8b2a1e5f4d';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

// All URLs to submit (matches what @astrojs/sitemap generates)
const urls = [
  `https://${HOST}/`,
  `https://${HOST}/about`,
  ...Array.from({ length: 114 }, (_, i) => `https://${HOST}/surah/${i + 1}`),
];

const body = {
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList: urls,
};

const endpoints = [
  'https://api.indexnow.org/IndexNow', // generic — fans out to Bing, Yandex, Seznam, Naver
];

async function ping(endpoint) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`  ${endpoint} → ${res.status} ${res.statusText} ${text ? `(${text.slice(0, 100)})` : ''}`);
  return res.ok;
}

console.log(`Pinging IndexNow for ${urls.length} URLs…`);
const results = await Promise.all(endpoints.map(ping));
const ok = results.every(Boolean);
console.log(ok ? '\n✓ All IndexNow pings succeeded' : '\n⚠ Some IndexNow pings failed');
process.exit(ok ? 0 : 1);
