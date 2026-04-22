#!/usr/bin/env node
/**
 * Runs SQL migrations against the Supabase Postgres DB.
 *
 * Usage:
 *   PGPASSWORD='...' node scripts/migrate.mjs supabase/schema.sql
 *   PGPASSWORD='...' node scripts/migrate.mjs            # defaults to schema.sql
 *
 * Picks up connection info from env vars:
 *   PGHOST      — defaults to db.<project_ref>.supabase.co
 *   PGPORT      — defaults to 5432
 *   PGDATABASE  — defaults to postgres
 *   PGUSER      — defaults to postgres
 *   PGPASSWORD  — required (the DB password you saved at project creation)
 *   PGSSLMODE   — defaults to require
 *
 * For Supabase, you can either pass PGHOST directly or set PROJECT_REF:
 *   PROJECT_REF=gqrliszhjueskvhajtvd PGPASSWORD='...' node scripts/migrate.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(join(__dirname, '..'));

const arg = process.argv[2] || 'supabase/schema.sql';
const sqlPath = resolve(arg.startsWith('/') ? arg : join(ROOT, arg));

function hostFromRef() {
  const ref = process.env.PROJECT_REF || process.env.SUPABASE_PROJECT_REF;
  if (!ref) return null;
  return `db.${ref}.supabase.co`;
}

const config = {
  host: process.env.PGHOST || hostFromRef(),
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false }, // Supabase presents a cert we don't need to CA-verify for a one-off migration
  connectionTimeoutMillis: 30000,
  query_timeout: 60000,
};

if (!config.host) {
  console.error('ERROR: No host. Set PGHOST or PROJECT_REF env var.');
  process.exit(1);
}
if (!config.password) {
  console.error('ERROR: PGPASSWORD env var is required.');
  process.exit(1);
}

console.log(`\n▸ Migration runner`);
console.log(`  host     : ${config.host}`);
console.log(`  database : ${config.database}`);
console.log(`  user     : ${config.user}`);
console.log(`  file     : ${sqlPath}\n`);

const client = new pg.Client(config);

try {
  const sql = await readFile(sqlPath, 'utf8');
  const statements = sql.split(/;\s*\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('--'));
  console.log(`  ${statements.length} statements to execute\n`);

  await client.connect();
  console.log('  ✓ connected');

  // Run the entire file as one transaction — easier to reason about.
  // pg client accepts multi-statement queries as long as no parameters are bound.
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
    console.log('\n✅ migration applied successfully');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ migration failed — rolled back');
    console.error(err.message);
    if (err.position) console.error(`  at position ${err.position}`);
    if (err.hint) console.error(`  hint: ${err.hint}`);
    if (err.detail) console.error(`  detail: ${err.detail}`);
    process.exit(1);
  }

  // Verification probe
  const verify = await client.query(`
    select count(*) as policies
    from pg_policy
    where polrelid = 'public.user_data'::regclass
  `).catch(() => null);
  if (verify) console.log(`  ${verify.rows[0].policies} RLS policies on public.user_data`);

  const counts = await client.query(`
    select
      (select count(*) from auth.users) as users,
      (select count(*) from public.user_data) as user_data_rows
  `).catch(() => null);
  if (counts) console.log(`  ${counts.rows[0].users} auth users / ${counts.rows[0].user_data_rows} user_data rows`);
} finally {
  await client.end().catch(() => {});
}
