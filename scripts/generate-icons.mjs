// Generate PWA icons จากโลโก้ SAKOFAH HR connect (logo-source.jpg)
// รัน: node scripts/generate-icons.mjs

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');
const SRC = resolve(PUBLIC, 'logo-source.jpg');

// PNG icons (ชื่อไฟล์คงเดิม → ไม่ต้องแก้ manifest/layout)
const targets = [
  { size: 180, file: 'apple-touch-icon.png' },
  { size: 192, file: 'icon-192.png' },
  { size: 512, file: 'icon-512.png' },
];

for (const t of targets) {
  await sharp(SRC).resize(t.size, t.size).png().toFile(resolve(PUBLIC, t.file));
  console.log(`✅ ${t.file} (${t.size}x${t.size})`);
}

// favicon.ico — ฝัง PNG หลายขนาดในคอนเทนเนอร์ ICO (รองรับ PNG-in-ICO)
// Maskable icons need safe padding so Android launchers do not crop the logo.
const maskableTargets = [
  { size: 192, file: 'icon-maskable-192.png' },
  { size: 512, file: 'icon-maskable-512.png' },
];

for (const t of maskableTargets) {
  const inner = Math.round(t.size * 0.8);
  const logo = await sharp(SRC).resize(inner, inner).png().toBuffer();
  await sharp({
    create: {
      width: t.size,
      height: t.size,
      channels: 3,
      background: '#2b303c',
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(resolve(PUBLIC, t.file));
  console.log(`ok ${t.file} (${t.size}x${t.size}, maskable)`);
}

const icoSizes = [16, 32, 48];
const pngs = [];
for (const s of icoSizes) {
  // Next.js ICO decoder ต้องการ PNG แบบ RGBA → ensureAlpha()
  pngs.push({ size: s, buf: await sharp(SRC).resize(s, s).ensureAlpha().png().toBuffer() });
}
const count = pngs.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(count, 4);
const dir = Buffer.alloc(16 * count);
let offset = 6 + 16 * count;
pngs.forEach((p, i) => {
  const d = dir.subarray(i * 16);
  d.writeUInt8(p.size >= 256 ? 0 : p.size, 0); // width
  d.writeUInt8(p.size >= 256 ? 0 : p.size, 1); // height
  d.writeUInt8(0, 2); // palette
  d.writeUInt8(0, 3); // reserved
  d.writeUInt16LE(1, 4); // color planes
  d.writeUInt16LE(32, 6); // bits per pixel
  d.writeUInt32LE(p.buf.length, 8); // size
  d.writeUInt32LE(offset, 12); // offset
  offset += p.buf.length;
});
const ico = Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
writeFileSync(resolve(ROOT, 'app', 'favicon.ico'), ico);
console.log(`✅ app/favicon.ico (${icoSizes.join(',')})`);

// icon.svg — ฝังโลโก้ 512 เป็น base64 (entry แบบ scalable ใน manifest)
const png512 = await sharp(SRC).resize(512, 512).png().toBuffer();
const b64 = png512.toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${b64}"/></svg>`;
writeFileSync(resolve(PUBLIC, 'icon.svg'), svg);
console.log('✅ public/icon.svg (ฝังโลโก้)');

console.log('\n🎉 เสร็จ! สร้าง icon จากโลโก้ HR connect ครบทุกขนาด');
