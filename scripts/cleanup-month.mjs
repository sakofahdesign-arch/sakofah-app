// Delete checkins and offsite photos for one month without deleting employees.
//
// Usage:
//   node scripts/cleanup-month.mjs --month=2026-07 --dry-run
//   node scripts/cleanup-month.mjs --month=2026-07 --confirm
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const BUCKET = 'checkin-photos';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--') && !arg.includes('=')));
const values = new Map(
  args
    .filter((arg) => arg.startsWith('--') && arg.includes('='))
    .map((arg) => {
      const idx = arg.indexOf('=');
      return [arg.slice(2, idx), arg.slice(idx + 1)];
    }),
);

function usage(exitCode = 0) {
  console.log(`
Cleanup Sakofah monthly checkins

Usage:
  node scripts/cleanup-month.mjs --month=2026-07 --dry-run
  node scripts/cleanup-month.mjs --month=2026-07 --confirm

Options:
  --month=YYYY-MM   Month to delete.
  --confirm         Required to actually delete data.
  --dry-run         Show counts only.
`);
  process.exit(exitCode);
}

function loadEnv() {
  const env = {};
  const text = readFileSync(resolve(ROOT, '.env.local'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function monthRange(monthStr) {
  const match = monthStr.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  return {
    start: new Date(year, month - 1, 1).toISOString(),
    end: new Date(year, month, 1).toISOString(),
  };
}

function chunks(items, size = 100) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function photoPathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
}

if (flags.has('--help') || args.length === 0) usage(args.length === 0 ? 1 : 0);

const monthStr = values.get('month');
const dryRun = flags.has('--dry-run');
const confirm = flags.has('--confirm');
const range = monthStr ? monthRange(monthStr) : null;

if (!monthStr || !range) {
  console.error('Missing or invalid --month=YYYY-MM');
  usage(1);
}

if (!dryRun && !confirm) {
  console.error('Refusing to delete without --confirm. Use --dry-run to preview.');
  usage(1);
}

let env;
try {
  env = loadEnv();
} catch (error) {
  console.error(`Could not read .env.local: ${error.message}`);
  process.exit(1);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: rows, error: selectError } = await supabase
  .from('checkins')
  .select('id, photo_url')
  .gte('ts', range.start)
  .lt('ts', range.end);

if (selectError) {
  console.error(`Select failed: ${selectError.message}`);
  process.exit(1);
}

const checkins = rows ?? [];
const photoPaths = Array.from(
  new Set(checkins.map((row) => photoPathFromPublicUrl(row.photo_url)).filter(Boolean)),
);

console.log(`Month: ${monthStr}`);
console.log(`Checkins to delete: ${checkins.length}`);
console.log(`Photos to delete: ${photoPaths.length}`);

if (dryRun) {
  console.log('Dry run only. No data deleted.');
  process.exit(0);
}

let photosDeleted = 0;
for (const batch of chunks(photoPaths)) {
  const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
  if (error) {
    console.error(`Storage delete failed: ${error.message}`);
    process.exit(1);
  }
  photosDeleted += data?.length ?? batch.length;
}

const { error: deleteError } = await supabase
  .from('checkins')
  .delete()
  .gte('ts', range.start)
  .lt('ts', range.end);

if (deleteError) {
  console.error(`Checkins delete failed: ${deleteError.message}`);
  process.exit(1);
}

console.log('Done.');
console.log(`Deleted checkins: ${checkins.length}`);
console.log(`Deleted photos: ${photosDeleted}`);
