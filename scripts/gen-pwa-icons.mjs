#!/usr/bin/env node
/**
 * Generates PWA PNG icons from public/favicon.svg. Runs as part of
 * prebuild so the icons are always in sync with the favicon. Uses
 * sharp (transitive dep of Astro).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

const sizes = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // Maskable variant — 20% safe-zone padding so the logo survives platform masks
  { file: 'icon-maskable-512.png', size: 512, padding: 0.2 },
  { file: 'apple-touch-icon.png', size: 180 },
];

async function main() {
  const svg = await readFile(join(PUBLIC, 'favicon.svg'));

  for (const { file, size, padding } of sizes) {
    let pipeline = sharp(svg, { density: 400 });
    if (padding) {
      const inner = Math.round(size * (1 - padding));
      const offset = Math.round((size - inner) / 2);
      pipeline = sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 16, g: 185, b: 129, alpha: 1 },
        },
      }).composite([
        { input: await sharp(svg, { density: 400 }).resize(inner, inner).png().toBuffer(), top: offset, left: offset },
      ]);
    } else {
      pipeline = pipeline.resize(size, size);
    }
    const buf = await pipeline.png().toBuffer();
    await writeFile(join(PUBLIC, file), buf);
    console.log(`  wrote ${file.padEnd(28)} (${size}×${size}, ${buf.length} bytes)`);
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
