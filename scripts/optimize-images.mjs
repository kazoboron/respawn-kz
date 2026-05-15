// One-shot script to convert hero/CTA backgrounds to WebP for smaller size.
// Run via: node scripts/optimize-images.mjs
import sharp from 'sharp';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'public/img';
const files = await readdir(DIR);
let savedBytes = 0;

for (const file of files) {
  if (!file.match(/\.(jpe?g|png)$/i)) continue;
  const inPath = join(DIR, file);
  const outPath = inPath.replace(/\.(jpe?g|png)$/i, '.webp');
  const beforeSize = (await stat(inPath)).size;
  await sharp(inPath)
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toFile(outPath);
  const afterSize = (await stat(outPath)).size;
  const saved = beforeSize - afterSize;
  savedBytes += saved;
  console.log(
    `${file} → ${outPath.split('/').pop()}: ${(beforeSize / 1024).toFixed(0)}KB → ${(afterSize / 1024).toFixed(0)}KB (-${((saved / beforeSize) * 100).toFixed(0)}%)`
  );
}

console.log(`\nTotal saved: ${(savedBytes / 1024).toFixed(0)}KB`);
