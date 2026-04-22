#!/usr/bin/env node
/**
 * Brute-forces Supabase pooler regions to find which one hosts the
 * given project. "Tenant or user not found" → region exists, not ours.
 * A successful SELECT → we found it.
 */
import pg from 'pg';

const ref = process.env.PROJECT_REF;
const password = process.env.PGPASSWORD;
if (!ref || !password) {
  console.error('Set PROJECT_REF and PGPASSWORD');
  process.exit(1);
}

const regions = [
  // AWS standard (most Supabase deployments)
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ca-central-1',
  'eu-central-1', 'eu-central-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3',
  'eu-north-1', 'eu-south-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-3',
  'ap-northeast-1', 'ap-northeast-2',
  'ap-south-1', 'ap-east-1',
  'sa-east-1',
  'me-south-1', 'af-south-1',
];
const prefixes = ['aws-0-', 'aws-1-'];

async function probe(host, user, password) {
  const client = new pg.Client({
    host, port: 5432, database: 'postgres',
    user, password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
  });
  try {
    await client.connect();
    const r = await client.query('SELECT current_database() AS db, current_user AS u, now() AS t');
    await client.end();
    return { host, ok: true, info: r.rows[0] };
  } catch (e) {
    try { await client.end(); } catch {}
    return { host, ok: false, err: e.message };
  }
}

const targets = [];
for (const p of prefixes) for (const r of regions) targets.push(`${p}${r}.pooler.supabase.com`);

console.log(`Probing ${targets.length} pooler hostnames…\n`);
const results = await Promise.allSettled(targets.map((h) => probe(h, `postgres.${ref}`, password)));

let found = null;
for (const r of results) {
  if (r.status !== 'fulfilled') continue;
  const v = r.value;
  if (v.ok) {
    console.log(`✅ ${v.host} — FOUND (${v.info.u})`);
    found = v;
    break;
  }
}
if (!found) {
  console.log('\nNo pooler accepted. Summary of errors:');
  const byError = new Map();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const err = r.value.err || 'unknown';
    const key = err.slice(0, 60);
    byError.set(key, (byError.get(key) || 0) + 1);
  }
  for (const [err, count] of byError) console.log(`  ${count}× ${err}`);
}
