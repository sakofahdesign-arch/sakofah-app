// Seed Sakofah staff + branches from Excel via Supabase Admin API
// รัน: node scripts/seed-sakofah-staff.mjs
//
// ก่อนรัน:
//   1. ใส่ SUPABASE_SERVICE_ROLE_KEY ใน .env.local
//   2. รัน migration-v5.sql ใน Supabase SQL Editor

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Load .env.local
const env = {};
try {
  const text = readFileSync(resolve(ROOT, '.env.local'), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch (e) {
  console.error('❌ อ่าน .env.local ไม่ได้:', e.message);
  process.exit(1);
}

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error('❌ ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env.local');
  process.exit(1);
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Read Excel
const xlsxPath = resolve(ROOT, 'scripts', 'sakofah-staff.xlsx');
console.log(`📂 อ่านไฟล์: ${xlsxPath}`);
const wb = XLSX.readFile(xlsxPath);

const empRows = XLSX.utils.sheet_to_json(wb.Sheets['employees']);
const branchSheet = wb.SheetNames.find((s) => s.startsWith('branches'));
const branchRows = XLSX.utils.sheet_to_json(wb.Sheets[branchSheet]);

console.log(`📊 พนักงาน: ${empRows.length} คน · สาขา: ${branchRows.length} สาขา`);

// === 1. Seed branches (upsert) ===
console.log('\n🏢 บันทึกสาขา...');
let branchOk = 0, branchFail = 0;
for (const b of branchRows) {
  const name = b['name (ชื่อสาขา)'];
  const payload = {
    name,
    lat: Number(b.lat),
    lng: Number(b.lng),
    radius_m: Number(b.radius_m) || 80,
  };
  const { error } = await supabase.from('branches').upsert(payload, { onConflict: 'name' });
  if (error) { console.error(`  ❌ ${name}:`, error.message); branchFail++; }
  else { console.log(`  ✅ ${name} (${payload.lat}, ${payload.lng}, ${payload.radius_m}m)`); branchOk++; }
}

// === 2. Fetch existing auth users to delete + recreate ===
console.log('\n🔍 ดึงรายชื่อ user เดิมจาก auth...');
const existingMap = new Map();
let page = 1;
while (true) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) { console.error('❌ listUsers:', error.message); break; }
  for (const u of data?.users ?? []) {
    if (u.email) existingMap.set(u.email, u.id);
  }
  if (!data?.users || data.users.length < 1000) break;
  page++;
}
console.log(`  มี user ทั้งหมด: ${existingMap.size}`);

// === 3. Delete + Create users ===
console.log(`\n✨ สร้าง ${empRows.length} user ใหม่ผ่าน Admin API...`);
let success = 0, failed = 0;

for (const emp of empRows) {
  const empId = String(emp.empId).trim();
  const pin = String(emp.PIN).trim();
  const fullName = String(emp.fullName).trim();
  const department = emp.department ? String(emp.department).trim() : null;
  const branch = String(emp.branch).trim();
  const role = (emp.role || 'staff').toString().trim();
  const email = `${empId.toLowerCase()}@sakofah.local`;

  // Delete existing if exists (cascade ลบ identities + employees)
  if (existingMap.has(email)) {
    await supabase.auth.admin.deleteUser(existingMap.get(email));
  }

  // Create via Admin API
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { name: fullName },
  });

  if (createErr) {
    console.error(`  ❌ ${empId} (${fullName}):`, createErr.message);
    failed++;
    continue;
  }

  // Insert employees row
  const { error: empErr } = await supabase.from('employees').insert({
    id: created.user.id,
    emp_id: empId,
    name: fullName,
    department,
    role,
    active: true,
    branch,
  });

  if (empErr) {
    console.error(`  ❌ ${empId} employees row:`, empErr.message);
    failed++;
    continue;
  }

  console.log(`  ✅ ${empId} → ${fullName} · ${branch}${department ? ' · ' + department : ''}`);
  success++;
}

console.log(`\n📊 สรุป:`);
console.log(`  🏢 สาขา: ${branchOk}/${branchRows.length}`);
console.log(`  👤 พนักงาน: ${success}/${empRows.length} ${failed > 0 ? `(❌ ล้มเหลว ${failed})` : ''}`);
console.log('\n🎉 เสร็จ! ลอง login ได้เลย\n');
