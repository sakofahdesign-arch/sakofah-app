// Reset test-only state without deleting employee records.
//
// Usage:
//   node scripts/reset-test-state.mjs --emp=691415
//   node scripts/reset-test-state.mjs --emp=691415,691416 --reset-passwords
//   node scripts/reset-test-state.mjs --all --confirm
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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
Reset Sakofah test state

Usage:
  node scripts/reset-test-state.mjs --emp=691415
  node scripts/reset-test-state.mjs --emp=691415,691416 --reset-passwords
  node scripts/reset-test-state.mjs --all --confirm

Options:
  --emp=ID[,ID]       Reset selected employee IDs.
  --all               Reset every employee. Requires --confirm.
  --confirm           Required with --all.
  --keep-checkins     Keep checkin/offsite history.
  --reset-passwords   Reset auth passwords back to PIN values from scripts/sakofah-staff.xlsx.
  --dry-run           Show target employees only.
`);
  process.exit(exitCode);
}

if (flags.has('--help') || args.length === 0) usage(args.length === 0 ? 1 : 0);

const all = flags.has('--all');
const confirm = flags.has('--confirm');
const keepCheckins = flags.has('--keep-checkins');
const resetPasswords = flags.has('--reset-passwords');
const dryRun = flags.has('--dry-run');
const empIds = (values.get('emp') ?? '')
  .split(',')
  .map((id) => id.trim().toUpperCase())
  .filter(Boolean);

if (!all && empIds.length === 0) {
  console.error('Missing scope: use --emp=ID or --all --confirm.');
  usage(1);
}

if (all && !confirm) {
  console.error('Refusing to reset every employee without --confirm.');
  usage(1);
}

function loadEnv() {
  const env = {};
  const text = readFileSync(resolve(ROOT, '.env.local'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    env[match[1]] = value;
  }
  return env;
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

function chunks(items, size = 100) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function getTargets() {
  let query = supabase.from('employees').select('id, emp_id, name').order('emp_id');
  if (!all) query = query.in('emp_id', empIds);
  const { data, error } = await query;
  if (error) throw new Error(`employees select failed: ${error.message}`);
  return data ?? [];
}

async function resetEmployeeRows(targetIds) {
  const payload = {
    device_id: null,
    device_bound_at: null,
    pin_changed: false,
  };
  let updated = 0;

  for (const part of chunks(targetIds)) {
    let { data, error } = await supabase
      .from('employees')
      .update(payload)
      .in('emp_id', part)
      .select('emp_id');

    if (error && /device_bound_at/i.test(error.message)) {
      const fallbackPayload = { device_id: null, pin_changed: false };
      const fallback = await supabase
        .from('employees')
        .update(fallbackPayload)
        .in('emp_id', part)
        .select('emp_id');
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(`employees reset failed: ${error.message}`);
    updated += data?.length ?? 0;
  }

  return updated;
}

async function deleteByEmployee(table, targetIds) {
  let deleted = 0;
  for (const part of chunks(targetIds)) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .in('emp_id', part)
      .select('id');
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
    deleted += data?.length ?? 0;
  }
  return deleted;
}

async function loadInitialPins() {
  const XLSX = await import('xlsx');
  const workbook = XLSX.default.readFile(resolve(ROOT, 'scripts', 'sakofah-staff.xlsx'));
  const rows = XLSX.default.utils.sheet_to_json(workbook.Sheets.employees);
  const pins = new Map();
  for (const row of rows) {
    const empId = String(row.empId ?? '').trim().toUpperCase();
    const pin = String(row.PIN ?? '').trim();
    if (empId && pin) pins.set(empId, pin);
  }
  return pins;
}

async function resetAuthPasswords(targets) {
  const pins = await loadInitialPins();
  let success = 0;
  let failed = 0;

  for (const employee of targets) {
    const pin = pins.get(employee.emp_id);
    if (!pin) {
      console.error(`  password skipped ${employee.emp_id}: no PIN in Excel`);
      failed++;
      continue;
    }
    const { error } = await supabase.auth.admin.updateUserById(employee.id, { password: pin });
    if (error) {
      console.error(`  password failed ${employee.emp_id}: ${error.message}`);
      failed++;
      continue;
    }
    success++;
  }

  return { success, failed };
}

try {
  const targets = await getTargets();
  if (targets.length === 0) {
    console.error('No matching employees found.');
    process.exit(1);
  }

  const targetIds = targets.map((employee) => employee.emp_id);
  console.log(`Targets (${targets.length}): ${targetIds.join(', ')}`);

  if (dryRun) {
    console.log('Dry run only. Nothing changed.');
    process.exit(0);
  }

  const employeesUpdated = await resetEmployeeRows(targetIds);
  const deviceRequestsDeleted = await deleteByEmployee('device_requests', targetIds);
  const checkinsDeleted = keepCheckins ? 0 : await deleteByEmployee('checkins', targetIds);
  const passwordResult = resetPasswords ? await resetAuthPasswords(targets) : null;

  console.log('\nDone.');
  console.log(`  employees reset: ${employeesUpdated}`);
  console.log(`  device requests deleted: ${deviceRequestsDeleted}`);
  console.log(`  checkins deleted: ${checkinsDeleted}${keepCheckins ? ' (kept by flag)' : ''}`);
  if (passwordResult) {
    console.log(`  passwords reset: ${passwordResult.success}`);
    console.log(`  password failures: ${passwordResult.failed}`);
  } else {
    console.log('  passwords reset: skipped');
  }
  console.log('\nOpen /logout on test devices to clear browser sessions and local device IDs.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
