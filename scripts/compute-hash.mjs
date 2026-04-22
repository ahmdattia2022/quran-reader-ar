#!/usr/bin/env node
/**
 * Computes SHA-256 of the Quran text data files so any modification
 * can be detected. Output written to public/quran-hash.txt (served
 * from the site root for verification) and logged for /about.
 *
 * Run via: npm run hash:quran (and as a prebuild step).
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const files = [
  { path: join(ROOT, 'src', 'data', 'quran.json'), name: 'quran.json' },
  { path: join(ROOT, 'src', 'data', 'index.json'), name: 'index.json' },
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function main() {
  const lines = [];
  lines.push('# Quran Reader — content integrity hashes (SHA-256)');
  lines.push('# Source: api.alquran.cloud — Uthmani edition + Tafsir Al-Muyassar');
  lines.push(`# Generated at build time: ${new Date().toISOString()}`);
  lines.push('');

  const record = {};
  for (const f of files) {
    const buf = await readFile(f.path);
    const hash = sha256(buf);
    lines.push(`${f.name}  ${hash}  ${buf.length} bytes`);
    record[f.name] = { sha256: hash, bytes: buf.length };
    console.log(`  ${f.name.padEnd(14)} ${hash}  (${buf.length} bytes)`);
  }

  const out = lines.join('\n') + '\n';
  await writeFile(join(ROOT, 'public', 'quran-hash.txt'), out, 'utf8');
  // Also emit a JSON variant for build-time consumption (About page)
  await writeFile(join(ROOT, 'src', 'data', 'content-hash.json'), JSON.stringify(record, null, 2), 'utf8');

  console.log('\nWrote public/quran-hash.txt and src/data/content-hash.json');
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
