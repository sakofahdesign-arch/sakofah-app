// Generate PNG icons จาก SVG เพื่อให้ iOS PWA แสดงโลโก้
// รัน: node scripts/generate-icons.mjs

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');

const svg = readFileSync(resolve(PUBLIC, 'icon.svg'));

const targets = [
  { size: 180, file: 'apple-touch-icon.png' },
  { size: 192, file: 'icon-192.png' },
  { size: 512, file: 'icon-512.png' },
];

for (const t of targets) {
  await sharp(svg)
    .resize(t.size, t.size)
    .png()
    .toFile(resolve(PUBLIC, t.file));
  console.log(`✅ ${t.file} (${t.size}x${t.size})`);
}

console.log('\n🎉 เสร็จ! Commit + push ได้เลย');
