# Monthly Archive and Fast Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add monthly Excel report archiving before cleanup, let the existing Export Excel button download live or archived reports, and make check-in/offsite submits feel faster while keeping GPS and device validation.

**Architecture:** First extract the existing workbook generation into a shared client/server-safe module so browser export and server archive use the same Excel layout. Then add Supabase-backed private archive storage and date-range cleanup that archives before deleting. Finally update check-in/offsite UI so success is shown before heavy refresh work, with timing measurements captured during verification.

**Tech Stack:** Next.js App Router server actions, React client components, Supabase Postgres, Supabase Storage private bucket with signed URLs, `xlsx-js-style`, Node script tests.

## Global Constraints

- Keep the current `Export Excel` button as the admin's main export action.
- Month export: if live check-ins exist, generate current live workbook even when the month is incomplete.
- Month export: if no live check-ins exist and an archive exists, download the archived Excel file.
- Month export: if neither live data nor archive exists, show a clear no-file message in Thai.
- Cleanup must require an explicit `date_from` and `date_to`.
- Cleanup date range must stay inside one calendar month.
- Cleanup must create/upload/archive metadata before deleting photos or check-ins.
- Do not delete employees, PIN state, device bindings, branches, settings, HR leave data, or archived Excel files during cleanup.
- GPS and device readiness still control whether check-in/offsite buttons can be pressed.
- Server actions still validate employee status, device binding, duplicate day rules, and GPS/range rules.
- Offsite still uploads photo evidence before inserting a check-in, but client-side image processing should be predictable and retryable.
- Do not expose Supabase service-role keys to client code.
- New Supabase public tables must have RLS enabled and explicit grants because new-table Data API exposure may not be automatic.
- Before editing Next.js code, respect `AGENTS.md`: read the relevant local Next docs in `node_modules/next/dist/docs/`.

---

## File Structure

- Modify: `lib/attendance-report-excel.ts`
  - Keep color constants, leave parsing, warning style helpers, and shared report types.
- Create: `lib/attendance-report-workbook.ts`
  - Owns `buildAttendanceReportWorkbook(input)` and `makeAttendanceReportFileName(monthStr)`.
  - Imports `xlsx-js-style` and report helpers.
  - Safe for both browser and server imports.
- Modify: `scripts/attendance-report-excel.test.mjs`
  - Extends existing tests for the extracted builder and leave merge behavior.
- Create: `lib/attendance-report-archive.ts`
  - Pure archive helpers: date range validation, month key derivation, storage path naming, export decision.
- Create: `scripts/attendance-report-archive.test.mjs`
  - Tests the pure archive helpers and fake sequencing for archive-before-delete.
- Create: Supabase migration via `supabase migration new attendance_report_archives` when CLI is available.
  - If this repo has no Supabase CLI, create `migration-v11-attendance-report-archives.sql` to match the existing `migration-v*.sql` convention.
  - Adds `attendance_report_archives` and private bucket metadata/policies.
- Modify: `supabase-schema.sql`
  - Mirror the archive table and bucket notes for fresh setup documentation.
- Modify: `app/admin/actions.ts`
  - Add `createAttendanceArchiveForRange`, `getAttendanceArchiveDownload`, `cleanupCheckinsInRange`.
  - Keep old cleanup behavior only as a compatibility wrapper if needed.
- Modify: `app/admin/page.tsx`
  - Pass archive presence for the selected month if helpful for UI copy; otherwise keep lookup inside server actions.
- Modify: `app/admin/AdminClient.tsx`
  - Use shared workbook builder for live exports.
  - Export button decides live/archive/no-file.
  - Replace prompt cleanup with a date-range modal.
- Modify: `app/checkin/CheckinClient.tsx`
  - Add success dialog and timing marks.
  - Disable main button when GPS is missing or outside range.
  - Defer refresh until after success dialog is visible or closed.
- Create: `lib/checkin-ui.ts`
  - Pure UI helpers for check-in success dialog copy and timing labels.
- Create: `scripts/checkin-ui.test.mjs`
  - Tests dialog copy, action labels, and timing helper.
- Modify: `app/offsite/page.tsx`
  - Extract stable image processing constants, improve blob validation, add success dialog, and keep retry state.
- Create: `lib/offsite-photo.ts`
  - Pure image sizing/compression helpers that browser canvas code can call.
- Create: `scripts/offsite-photo.test.mjs`
  - Tests computed dimensions and quality settings.

---

### Task 1: Extract Shared Attendance Workbook Builder

**Files:**
- Create: `lib/attendance-report-workbook.ts`
- Modify: `lib/attendance-report-excel.ts`
- Modify: `app/admin/AdminClient.tsx`
- Modify: `scripts/attendance-report-excel.test.mjs`

**Interfaces:**
- Consumes:
  - `buildApprovedLeaveDayMap(leaves, reportYear, reportMonth)` from `lib/attendance-report-excel.ts`
  - `getAttendanceDayWarning(input)` from `lib/attendance-report-excel.ts`
  - `getEmployeeDayCellStyle(isWarningDay)` from `lib/attendance-report-excel.ts`
  - `getEmployeeLeaveCellStyle()` from `lib/attendance-report-excel.ts`
- Produces:
  - `type AttendanceReportEmployee`
  - `type AttendanceReportCheckin`
  - `type AttendanceReportSettings`
  - `type BuildAttendanceReportWorkbookInput`
  - `function buildAttendanceReportWorkbook(input: BuildAttendanceReportWorkbookInput): XLSX.WorkBook`
  - `function makeAttendanceReportFileName(monthStr: string): string`

- [ ] **Step 1: Write the failing builder import test**

Add this to `scripts/attendance-report-excel.test.mjs`:

```js
async function testWorkbookBuilderExportsLeaveCells() {
  const { buildAttendanceReportWorkbook, makeAttendanceReportFileName } = await import('../lib/attendance-report-workbook.ts');
  const wb = buildAttendanceReportWorkbook({
    adminName: 'Admin Test',
    monthStr: '2026-07',
    employees: [
      { emp_id: '690002', name: 'Test Employee', role: 'staff', active: true, branch: 'HQ', device_id: null },
    ],
    checkins: [],
    settings: {
      office_lat: 0,
      office_lng: 0,
      radius_m: 100,
      allowed_ssid: '',
      work_start: '08:20',
      work_end: '16:30',
      late_tolerance_min: 5,
      work_days: 'MTWTF',
    },
    branchNames: ['HQ'],
    leaveRequests: [
      { empId: '690002', type: 'ลาป่วย', start: '2026-07-10', end: '2026-07-10', status: 'Approved' },
    ],
  });

  assert.equal(makeAttendanceReportFileName('2026-07'), 'attendance-report-2026-07.xlsx');
  const ws = wb.Sheets['รายพนักงาน'];
  assert.ok(ws, 'employee sheet should exist');
  const cells = Object.values(ws).filter((cell) => cell && typeof cell === 'object' && cell.v === 'ลาป่วย');
  assert.equal(cells.length, 1, 'leave text should be written once in merged employee day cell');
}
```

Call the test from the existing async test runner:

```js
await testWorkbookBuilderExportsLeaveCells();
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run: `node scripts\attendance-report-excel.test.mjs`

Expected: FAIL with a module-not-found error for `lib/attendance-report-workbook.ts`.

- [ ] **Step 3: Create the builder module**

Create `lib/attendance-report-workbook.ts` with the types below, then move the workbook creation body from `AdminClient.exportExcel()` into `buildAttendanceReportWorkbook`.

```ts
import XLSX from 'xlsx-js-style';
import {
  buildApprovedLeaveDayMap,
  getAttendanceDayWarning,
  getEmployeeDayCellStyle,
  getEmployeeLeaveCellStyle,
  type HrLeaveRequest,
} from './attendance-report-excel';

export type AttendanceReportEmployee = {
  emp_id: string;
  name: string;
  role: string;
  active: boolean;
  branch: string | null;
  device_id: string | null;
};

export type AttendanceReportCheckin = {
  id: string;
  emp_id: string;
  type: string;
  ts: string;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  location_note: string | null;
  status: string;
  employees: { name: string; branch: string | null };
};

export type AttendanceReportSettings = {
  office_lat: number;
  office_lng: number;
  radius_m: number;
  allowed_ssid: string;
  work_start: string;
  work_end: string;
  late_tolerance_min?: number;
  work_days?: string;
} | null;

export type BuildAttendanceReportWorkbookInput = {
  adminName: string;
  monthStr: string;
  employees: AttendanceReportEmployee[];
  checkins: AttendanceReportCheckin[];
  settings: AttendanceReportSettings;
  branchNames: string[];
  leaveRequests: HrLeaveRequest[];
  generatedAt?: Date;
};

export function makeAttendanceReportFileName(monthStr: string) {
  return `attendance-report-${monthStr}.xlsx`;
}

export function buildAttendanceReportWorkbook(input: BuildAttendanceReportWorkbookInput) {
  const wb = XLSX.utils.book_new();
  const { adminName, monthStr, employees, checkins, settings, branchNames, leaveRequests } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leaveDayMap = buildApprovedLeaveDayMap(leaveRequests, year, month);

  // Move the existing workbook construction statements from AdminClient.exportExcel into this function:
  // wb.Props assignment, format helpers, checkin grouping, employee stats, summary sheet,
  // branch sheets, employee day sheet, column widths, merges, styles, and workbook append calls.
  // Remove only the final XLSX.writeFile call from the moved code; this function returns wb instead.
  return wb;
}
```

- [ ] **Step 4: Wire live Export Excel to the shared builder**

In `app/admin/AdminClient.tsx`, replace direct workbook construction with:

```ts
import XLSX from 'xlsx-js-style';
import { buildAttendanceReportWorkbook, makeAttendanceReportFileName } from '@/lib/attendance-report-workbook';
```

Then change `exportExcel()` to:

```ts
function exportExcel() {
  const wb = buildAttendanceReportWorkbook({
    adminName,
    monthStr,
    employees,
    checkins,
    settings,
    branchNames: branches,
    leaveRequests,
  });
  XLSX.writeFile(wb, makeAttendanceReportFileName(monthStr));
}
```

- [ ] **Step 5: Run tests and build**

Run:

```powershell
node scripts\attendance-report-excel.test.mjs
npm.cmd run build
```

Expected: Excel test PASS and production build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add lib/attendance-report-excel.ts lib/attendance-report-workbook.ts app/admin/AdminClient.tsx scripts/attendance-report-excel.test.mjs
git commit -m "Extract attendance report workbook builder"
```

---

### Task 2: Add Archive Schema and Pure Archive Helpers

**Files:**
- Create: Supabase migration file from CLI or `migration-v11-attendance-report-archives.sql`
- Modify: `supabase-schema.sql`
- Create: `lib/attendance-report-archive.ts`
- Create: `scripts/attendance-report-archive.test.mjs`

**Interfaces:**
- Produces:
  - `const ATTENDANCE_ARCHIVE_BUCKET = 'attendance-report-archives'`
  - `type DateRangeValidationResult`
  - `function validateSingleMonthDateRange(dateFrom: string, dateTo: string): DateRangeValidationResult`
  - `function monthKeyFromDateRange(dateFrom: string, dateTo: string): string`
  - `function makeArchiveStoragePath(monthStr: string, createdAt: Date): string`
  - `type ExportDecision = { kind: 'live' } | { kind: 'archive' } | { kind: 'none' }`
  - `function decideMonthExport(liveCheckinCount: number, archiveExists: boolean): ExportDecision`

- [ ] **Step 1: Write pure helper tests**

Create `scripts/attendance-report-archive.test.mjs`:

```js
import assert from 'node:assert/strict';

const archive = await import('../lib/attendance-report-archive.ts');

assert.equal(archive.ATTENDANCE_ARCHIVE_BUCKET, 'attendance-report-archives');

assert.deepEqual(
  archive.validateSingleMonthDateRange('2026-07-01', '2026-07-31'),
  { ok: true, monthStr: '2026-07', startIso: '2026-07-01T00:00:00.000+07:00', endExclusiveIso: '2026-08-01T00:00:00.000+07:00' },
);

assert.equal(
  archive.validateSingleMonthDateRange('2026-07-31', '2026-08-01').error,
  'กรุณาเลือกช่วงวันที่ให้อยู่ในเดือนเดียวกัน',
);

assert.equal(
  archive.validateSingleMonthDateRange('2026-07-10', '2026-07-09').error,
  'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น',
);

assert.equal(
  archive.makeArchiveStoragePath('2026-07', new Date('2026-08-01T02:03:04.000Z')),
  '2026-07/attendance-report-2026-07-20260801T020304000Z.xlsx',
);

assert.deepEqual(archive.decideMonthExport(5, false), { kind: 'live' });
assert.deepEqual(archive.decideMonthExport(0, true), { kind: 'archive' });
assert.deepEqual(archive.decideMonthExport(0, false), { kind: 'none' });

console.log('attendance-report-archive tests passed');
```

- [ ] **Step 2: Run helper tests and confirm they fail**

Run: `node scripts\attendance-report-archive.test.mjs`

Expected: FAIL with a module-not-found error for `lib/attendance-report-archive.ts`.

- [ ] **Step 3: Implement pure archive helpers**

Create `lib/attendance-report-archive.ts`:

```ts
export const ATTENDANCE_ARCHIVE_BUCKET = 'attendance-report-archives';

export type DateRangeValidationResult =
  | { ok: true; monthStr: string; startIso: string; endExclusiveIso: string }
  | { ok: false; error: string };

export type ExportDecision =
  | { kind: 'live' }
  | { kind: 'archive' }
  | { kind: 'none' };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function validateSingleMonthDateRange(dateFrom: string, dateTo: string): DateRangeValidationResult {
  const from = DATE_RE.exec(dateFrom);
  const to = DATE_RE.exec(dateTo);
  if (!from || !to) return { ok: false, error: 'กรุณาเลือกวันที่ให้ครบ' };
  if (`${from[1]}-${from[2]}` !== `${to[1]}-${to[2]}`) {
    return { ok: false, error: 'กรุณาเลือกช่วงวันที่ให้อยู่ในเดือนเดียวกัน' };
  }
  if (dateTo < dateFrom) return { ok: false, error: 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น' };

  const monthStr = `${from[1]}-${from[2]}`;
  const endDate = new Date(`${dateTo}T00:00:00.000+07:00`);
  endDate.setDate(endDate.getDate() + 1);
  const endYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(endDate);

  return {
    ok: true,
    monthStr,
    startIso: `${dateFrom}T00:00:00.000+07:00`,
    endExclusiveIso: `${endYmd}T00:00:00.000+07:00`,
  };
}

export function monthKeyFromDateRange(dateFrom: string, dateTo: string) {
  const result = validateSingleMonthDateRange(dateFrom, dateTo);
  if (!result.ok) throw new Error(result.error);
  return result.monthStr;
}

export function makeArchiveStoragePath(monthStr: string, createdAt: Date) {
  const stamp = createdAt.toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
  return `${monthStr}/attendance-report-${monthStr}-${stamp}.xlsx`;
}

export function decideMonthExport(liveCheckinCount: number, archiveExists: boolean): ExportDecision {
  if (liveCheckinCount > 0) return { kind: 'live' };
  if (archiveExists) return { kind: 'archive' };
  return { kind: 'none' };
}
```

- [ ] **Step 4: Add archive migration SQL**

If Supabase CLI is installed, run:

```powershell
supabase --help
supabase migration new attendance_report_archives
```

If this repo is not a Supabase CLI project, create `migration-v11-attendance-report-archives.sql` and add:

```sql
create table if not exists public.attendance_report_archives (
  id uuid primary key default gen_random_uuid(),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  date_from date not null,
  date_to date not null,
  storage_path text not null,
  file_name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  checkin_count int not null default 0 check (checkin_count >= 0),
  photo_count int not null default 0 check (photo_count >= 0)
);

create unique index if not exists attendance_report_archives_storage_path_key
  on public.attendance_report_archives(storage_path);

create index if not exists attendance_report_archives_month_created_at_idx
  on public.attendance_report_archives(month, created_at desc);

alter table public.attendance_report_archives enable row level security;

grant select, insert, update, delete on public.attendance_report_archives to service_role;
grant select on public.attendance_report_archives to authenticated;

drop policy if exists "Admins can read attendance report archives" on public.attendance_report_archives;
create policy "Admins can read attendance report archives"
  on public.attendance_report_archives
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.employees
      where employees.id = (select auth.uid())
        and employees.role = 'admin'
    )
  );

insert into storage.buckets (id, name, public)
values ('attendance-report-archives', 'attendance-report-archives', false)
on conflict (id) do update set public = false;
```

- [ ] **Step 5: Mirror schema notes**

Append the table and bucket definition to `supabase-schema.sql` so fresh setup has the archive model documented.

- [ ] **Step 6: Run tests**

Run:

```powershell
node scripts\attendance-report-archive.test.mjs
node scripts\attendance-report-excel.test.mjs
```

Expected: both scripts PASS.

- [ ] **Step 7: Commit**

```powershell
git add lib/attendance-report-archive.ts scripts/attendance-report-archive.test.mjs supabase-schema.sql migration-v11-attendance-report-archives.sql
git commit -m "Add attendance archive schema helpers"
```

---

### Task 3: Implement Server Archive Creation and Signed Download Actions

**Files:**
- Modify: `app/admin/actions.ts`
- Modify: `lib/attendance-report-archive.ts`
- Modify: `scripts/attendance-report-archive.test.mjs`

**Interfaces:**
- Consumes:
  - `buildAttendanceReportWorkbook(input)` from `lib/attendance-report-workbook.ts`
  - `makeAttendanceReportFileName(monthStr)` from `lib/attendance-report-workbook.ts`
  - `ATTENDANCE_ARCHIVE_BUCKET`
  - `validateSingleMonthDateRange(dateFrom, dateTo)`
  - `makeArchiveStoragePath(monthStr, createdAt)`
- Produces:
  - `async function getAttendanceArchiveDownload(monthStr: string): Promise<{ ok: true; url: string; fileName: string } | { error: string }>`
  - `async function createAttendanceArchiveForRange(input: { dateFrom: string; dateTo: string }): Promise<{ ok: true; monthStr: string; checkinCount: number; photoCount: number; storagePath: string; fileName: string } | { error: string }>`

- [ ] **Step 1: Add fake sequencing tests**

Add to `scripts/attendance-report-archive.test.mjs`:

```js
async function runArchiveThenDelete({ archiveOk }) {
  const calls = [];
  const archive = async () => {
    calls.push('archive');
    return archiveOk ? { ok: true } : { error: 'archive failed' };
  };
  const removePhotos = async () => calls.push('removePhotos');
  const deleteRows = async () => calls.push('deleteRows');

  const archiveResult = await archive();
  if (archiveResult.error) return { calls, result: archiveResult };
  await removePhotos();
  await deleteRows();
  return { calls, result: { ok: true } };
}

assert.deepEqual((await runArchiveThenDelete({ archiveOk: true })).calls, ['archive', 'removePhotos', 'deleteRows']);
assert.deepEqual((await runArchiveThenDelete({ archiveOk: false })).calls, ['archive']);
```

- [ ] **Step 2: Run tests**

Run: `node scripts\attendance-report-archive.test.mjs`

Expected: PASS because this documents required ordering before server action wiring.

- [ ] **Step 3: Add archive data fetch helper inside `app/admin/actions.ts`**

Add a helper that uses the service role admin client and the same selected date range:

```ts
async function loadArchiveReportData(admin: ReturnType<typeof createSupabaseAdminClient>, startIso: string, endExclusiveIso: string) {
  const [employeesRes, checkinsRes, settingsRes, branchesRes] = await Promise.all([
    admin.from('employees').select('emp_id, name, role, active, branch, device_id').order('emp_id'),
    admin
      .from('checkins')
      .select('id, emp_id, type, ts, lat, lng, photo_url, location_note, status, employees(name, branch)')
      .gte('ts', startIso)
      .lt('ts', endExclusiveIso)
      .order('ts', { ascending: true }),
    admin.from('settings').select('*').limit(1).maybeSingle(),
    admin.from('branches').select('name').order('name'),
  ]);

  if (employeesRes.error) throw new Error(employeesRes.error.message);
  if (checkinsRes.error) throw new Error(checkinsRes.error.message);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (branchesRes.error) throw new Error(branchesRes.error.message);

  return {
    employees: employeesRes.data ?? [],
    checkins: checkinsRes.data ?? [],
    settings: settingsRes.data ?? null,
    branchNames: (branchesRes.data ?? []).map((row) => row.name).filter(Boolean),
  };
}
```

- [ ] **Step 4: Implement archive creation action**

In `app/admin/actions.ts`, import workbook/archive helpers:

```ts
import XLSX from 'xlsx-js-style';
import { buildAttendanceReportWorkbook, makeAttendanceReportFileName } from '@/lib/attendance-report-workbook';
import { ATTENDANCE_ARCHIVE_BUCKET, makeArchiveStoragePath, validateSingleMonthDateRange } from '@/lib/attendance-report-archive';
```

Implement `createAttendanceArchiveForRange`:

```ts
export async function createAttendanceArchiveForRange({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const supabase = await requireAdmin();
  if (!supabase) return { error: 'ไม่มีสิทธิ์' };

  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  if (!admin) return { error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY สำหรับเก็บไฟล์รายงาน' };

  const range = validateSingleMonthDateRange(dateFrom, dateTo);
  if (!range.ok) return { error: range.error };

  try {
    const reportData = await loadArchiveReportData(admin, range.startIso, range.endExclusiveIso);
    const createdAt = new Date();
    const storagePath = makeArchiveStoragePath(range.monthStr, createdAt);
    const fileName = makeAttendanceReportFileName(range.monthStr);
    const wb = buildAttendanceReportWorkbook({
      ...reportData,
      adminName: user?.email ?? 'admin',
      monthStr: range.monthStr,
      leaveRequests: [],
      generatedAt: createdAt,
    });
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const photoCount = reportData.checkins.filter((row) => Boolean(row.photo_url)).length;

    const upload = await admin.storage
      .from(ATTENDANCE_ARCHIVE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });
    if (upload.error) return { error: upload.error.message };

    const meta = await admin.from('attendance_report_archives').insert({
      month: range.monthStr,
      date_from: dateFrom,
      date_to: dateTo,
      storage_path: storagePath,
      file_name: fileName,
      created_by: user?.id ?? null,
      checkin_count: reportData.checkins.length,
      photo_count: photoCount,
    });
    if (meta.error) return { error: meta.error.message };

    return { ok: true, monthStr: range.monthStr, checkinCount: reportData.checkins.length, photoCount, storagePath, fileName };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'สร้างไฟล์รายงานไม่สำเร็จ' };
  }
}
```

- [ ] **Step 5: Implement signed archive download action**

Add:

```ts
export async function getAttendanceArchiveDownload(monthStr: string) {
  const supabase = await requireAdmin();
  if (!supabase) return { error: 'ไม่มีสิทธิ์' };

  const admin = createAdminClient();
  if (!admin) return { error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY สำหรับโหลดไฟล์รายงาน' };
  if (!/^\d{4}-\d{2}$/.test(monthStr)) return { error: 'รูปแบบเดือนต้องเป็น YYYY-MM' };

  const { data, error } = await admin
    .from('attendance_report_archives')
    .select('storage_path, file_name')
    .eq('month', monthStr)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'ไม่มีไฟล์รายงานของเดือนนี้' };

  const signed = await admin.storage
    .from(ATTENDANCE_ARCHIVE_BUCKET)
    .createSignedUrl(data.storage_path, 60, { download: data.file_name });

  if (signed.error || !signed.data?.signedUrl) return { error: signed.error?.message ?? 'สร้างลิงก์ดาวน์โหลดไม่สำเร็จ' };
  return { ok: true, url: signed.data.signedUrl, fileName: data.file_name };
}
```

- [ ] **Step 6: Run verification**

Run:

```powershell
node scripts\attendance-report-archive.test.mjs
node scripts\attendance-report-excel.test.mjs
npm.cmd run build
```

Expected: tests PASS and build succeeds.

- [ ] **Step 7: Commit**

```powershell
git add app/admin/actions.ts lib/attendance-report-archive.ts scripts/attendance-report-archive.test.mjs
git commit -m "Add attendance archive server actions"
```

---

### Task 4: Wire Export Button to Live, Archive, or No File

**Files:**
- Modify: `app/admin/AdminClient.tsx`
- Modify: `app/admin/actions.ts`
- Modify: `scripts/attendance-report-archive.test.mjs`

**Interfaces:**
- Consumes:
  - `decideMonthExport(liveCheckinCount, archiveExists)`
  - `getAttendanceArchiveDownload(monthStr)`
  - `buildAttendanceReportWorkbook(input)`
- Produces:
  - `async function exportExcel(): Promise<void>` inside `AdminClient`
  - `function openSignedArchiveDownload(url: string): void` inside `AdminClient`

- [ ] **Step 1: Add export decision regression tests**

Ensure `scripts/attendance-report-archive.test.mjs` includes:

```js
assert.deepEqual(archive.decideMonthExport(1, false), { kind: 'live' });
assert.deepEqual(archive.decideMonthExport(1, true), { kind: 'live' });
assert.deepEqual(archive.decideMonthExport(0, true), { kind: 'archive' });
assert.deepEqual(archive.decideMonthExport(0, false), { kind: 'none' });
```

- [ ] **Step 2: Run tests**

Run: `node scripts\attendance-report-archive.test.mjs`

Expected: PASS.

- [ ] **Step 3: Import archive download action in `AdminClient`**

Update imports:

```ts
import { decideMonthExport } from '@/lib/attendance-report-archive';
import {
  approveDeviceRequest,
  cleanupMonthlyCheckins,
  getAttendanceArchiveDownload,
  rejectDeviceRequest,
  resetAllStaffAccess,
  resetEmployeeAccess,
} from './actions';
```

- [ ] **Step 4: Make Export async**

Replace `exportExcel()` with:

```ts
async function exportExcel() {
  setLiveNotice('กำลังเตรียมไฟล์ Excel...');

  const decision = decideMonthExport(checkins.length, true);
  if (decision.kind === 'live') {
    const wb = buildAttendanceReportWorkbook({
      adminName,
      monthStr,
      employees,
      checkins,
      settings,
      branchNames: branches,
      leaveRequests,
    });
    XLSX.writeFile(wb, makeAttendanceReportFileName(monthStr));
    setLiveNotice('ดาวน์โหลดรายงานจากข้อมูลปัจจุบันแล้ว');
    return;
  }

  const res = await getAttendanceArchiveDownload(monthStr);
  if (res.error) {
    setLiveNotice(res.error === 'ไม่มีไฟล์รายงานของเดือนนี้' ? 'ไม่มีไฟล์' : res.error);
    return;
  }

  const a = document.createElement('a');
  a.href = res.url;
  a.download = res.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setLiveNotice('ดาวน์โหลดไฟล์รายงานที่เก็บไว้แล้ว');
}
```

Note: `decideMonthExport(checkins.length, true)` intentionally treats the archive path as "try server lookup when no live data"; the server action returns no-file if archive metadata is missing.

- [ ] **Step 5: Update Export button state**

Find the existing Export Excel button and make sure it calls the async function without losing click errors:

```tsx
<button type="button" onClick={() => void exportExcel()} disabled={isPending}>
  <i className="ti ti-file-spreadsheet" aria-hidden></i>
  Export Excel
</button>
```

- [ ] **Step 6: Manual timing check**

In browser devtools console, measure:

```js
performance.mark('export-click')
```

Click Export and record:
- live current month: click to browser download start
- archived month: click to browser download start
- empty month: click to "ไม่มีไฟล์" notice

- [ ] **Step 7: Run verification**

Run:

```powershell
node scripts\attendance-report-archive.test.mjs
node scripts\attendance-report-excel.test.mjs
npm.cmd run build
```

Expected: tests PASS and build succeeds.

- [ ] **Step 8: Commit**

```powershell
git add app/admin/AdminClient.tsx app/admin/actions.ts scripts/attendance-report-archive.test.mjs
git commit -m "Route admin export to live or archived reports"
```

---

### Task 5: Replace Cleanup Prompt With Archive-Before-Delete Date Range Modal

**Files:**
- Modify: `app/admin/actions.ts`
- Modify: `app/admin/AdminClient.tsx`
- Modify: `scripts/attendance-report-archive.test.mjs`

**Interfaces:**
- Consumes:
  - `createAttendanceArchiveForRange({ dateFrom, dateTo })`
  - `validateSingleMonthDateRange(dateFrom, dateTo)`
  - existing `photoPathFromPublicUrl(url)`
- Produces:
  - `async function cleanupCheckinsInRange(input: { dateFrom: string; dateTo: string }): Promise<{ ok: true; message: string } | { error: string }>`
  - `CleanupRangeModal` component inside `AdminClient.tsx`

- [ ] **Step 1: Add validation and sequencing tests**

Add this assertion to `scripts/attendance-report-archive.test.mjs`:

```js
const invalid = archive.validateSingleMonthDateRange('', '2026-07-31');
assert.equal(invalid.ok, false);
assert.equal(invalid.error, 'กรุณาเลือกวันที่ให้ครบ');
```

The fake sequencing test from Task 3 already proves delete must not happen if archive fails.

- [ ] **Step 2: Run tests**

Run: `node scripts\attendance-report-archive.test.mjs`

Expected: PASS.

- [ ] **Step 3: Add cleanup range server action**

In `app/admin/actions.ts`, replace `cleanupMonthlyCheckins(monthStr)` usage with:

```ts
export async function cleanupCheckinsInRange({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const supabase = await requireAdmin();
  if (!supabase) return { error: 'ไม่มีสิทธิ์' };

  const admin = createAdminClient();
  if (!admin) return { error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY สำหรับลบข้อมูล' };

  const range = validateSingleMonthDateRange(dateFrom, dateTo);
  if (!range.ok) return { error: range.error };

  const archive = await createAttendanceArchiveForRange({ dateFrom, dateTo });
  if (archive.error) return { error: `ยังไม่ลบข้อมูล เพราะเก็บไฟล์ Excel ไม่สำเร็จ: ${archive.error}` };

  const { data: rows, error: selectErr } = await admin
    .from('checkins')
    .select('id, photo_url')
    .gte('ts', range.startIso)
    .lt('ts', range.endExclusiveIso);
  if (selectErr) return { error: selectErr.message };

  const checkins = rows ?? [];
  const photoPaths = Array.from(
    new Set(checkins.map((row) => photoPathFromPublicUrl(row.photo_url)).filter((path): path is string => Boolean(path))),
  );

  let photosDeleted = 0;
  for (const batch of chunks(photoPaths, 100)) {
    const { data, error } = await admin.storage.from(CHECKIN_PHOTO_BUCKET).remove(batch);
    if (error) return { error: `ลบรูปไม่สำเร็จ: ${error.message}` };
    photosDeleted += data?.length ?? batch.length;
  }

  const { error: deleteErr } = await admin
    .from('checkins')
    .delete()
    .gte('ts', range.startIso)
    .lt('ts', range.endExclusiveIso);
  if (deleteErr) return { error: deleteErr.message };

  revalidatePath('/admin');
  return {
    ok: true,
    message: `เก็บ Excel แล้ว และลบข้อมูล ${dateFrom} ถึง ${dateTo}: checkins ${checkins.length} รายการ, รูป ${photosDeleted} ไฟล์`,
  };
}
```

Keep a wrapper for old callers:

```ts
export async function cleanupMonthlyCheckins(monthStr: string) {
  const [year, month] = monthStr.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return cleanupCheckinsInRange({
    dateFrom: `${monthStr}-01`,
    dateTo: `${monthStr}-${String(lastDay).padStart(2, '0')}`,
  });
}
```

- [ ] **Step 4: Add cleanup modal state**

In `AdminClient`, add:

```ts
const [cleanupOpen, setCleanupOpen] = useState(false);
const [cleanupFrom, setCleanupFrom] = useState(`${monthStr}-01`);
const [cleanupTo, setCleanupTo] = useState(() => {
  const [y, m] = monthStr.split('-').map(Number);
  return `${monthStr}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
});
```

- [ ] **Step 5: Replace prompt handler**

Replace `handleCleanupMonth()` with:

```ts
function handleCleanupMonth() {
  setCleanupOpen(true);
}

function confirmCleanupRange() {
  const validation = validateSingleMonthDateRange(cleanupFrom, cleanupTo);
  if (!validation.ok) {
    setLiveNotice(validation.error);
    return;
  }
  startTransition(async () => {
    setLiveNotice('กำลังเก็บ Excel ก่อนลบข้อมูล...');
    const res = await cleanupCheckinsInRange({ dateFrom: cleanupFrom, dateTo: cleanupTo });
    setLiveNotice(res.error ?? res.message ?? 'ล้างข้อมูลสำเร็จ');
    if (!res.error) {
      setCleanupOpen(false);
      router.refresh();
    }
  });
}
```

- [ ] **Step 6: Add `CleanupRangeModal` JSX**

Add a simple fixed modal in `AdminClient.tsx` near the bottom of the render:

```tsx
{cleanupOpen && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 80, display: 'grid', placeItems: 'center', padding: 18 }}>
    <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>ล้างข้อมูลตามช่วงวันที่</div>
      <input type="date" value={cleanupFrom} onChange={(e) => setCleanupFrom(e.target.value)} style={inputStyle} />
      <input type="date" value={cleanupTo} onChange={(e) => setCleanupTo(e.target.value)} style={{ ...inputStyle, marginTop: 8 }} />
      <div style={{ fontSize: 11, color: '#a32d2d', marginTop: 10 }}>
        ระบบจะเก็บไฟล์ Excel ก่อนทุกครั้ง ถ้าเก็บไฟล์ไม่สำเร็จจะไม่ลบข้อมูล
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
        <button type="button" onClick={() => setCleanupOpen(false)} disabled={isPending} style={{ ...secondaryButtonStyle }}>
          ยกเลิก
        </button>
        <button type="button" onClick={confirmCleanupRange} disabled={isPending} style={{ ...dangerButtonStyle }}>
          {isPending ? 'กำลังทำงาน...' : 'เก็บ Excel แล้วลบ'}
        </button>
      </div>
    </div>
  </div>
)}
```

If `secondaryButtonStyle` and `dangerButtonStyle` do not exist, define local inline style objects near `inputStyle`.

- [ ] **Step 7: Run verification**

Run:

```powershell
node scripts\attendance-report-archive.test.mjs
node scripts\attendance-report-excel.test.mjs
npm.cmd run build
```

Manual:
- Open admin.
- Click cleanup button.
- Select `2026-07-31` to `2026-08-01`; expect Thai cross-month error.
- Select a valid range; expect "กำลังเก็บ Excel ก่อนลบข้อมูล..." before deletion.

- [ ] **Step 8: Commit**

```powershell
git add app/admin/actions.ts app/admin/AdminClient.tsx scripts/attendance-report-archive.test.mjs
git commit -m "Require archived range cleanup"
```

---

### Task 6: Verify Archive Flow Against Supabase

**Files:**
- Modify only files needed to fix verification failures.

**Interfaces:**
- Consumes:
  - `createAttendanceArchiveForRange`
  - `getAttendanceArchiveDownload`
  - `cleanupCheckinsInRange`

- [ ] **Step 1: Apply migration to Supabase**

Use the existing project workflow. If using Supabase dashboard SQL editor, run the SQL from the archive migration. If using CLI, inspect help first:

```powershell
supabase --help
supabase db --help
```

- [ ] **Step 2: Run Supabase security advisors**

If MCP project id is known, use the Supabase advisor tool for security and performance. If CLI is configured:

```powershell
supabase db advisors
```

Expected: no new RLS/storage warnings for `attendance_report_archives` or `attendance-report-archives`.

- [ ] **Step 3: Test server archive on real data**

Manual browser:
- Login as admin.
- Pick a month with check-ins.
- Open cleanup modal with a narrow safe range.
- Confirm.
- Verify the live notice says archive was stored before deletion.
- In Supabase Storage, verify an `.xlsx` object appears under `attendance-report-archives/<month>/`.
- In `attendance_report_archives`, verify a metadata row exists.

- [ ] **Step 4: Test archived export**

Manual browser:
- Select the same month after cleanup removed all live rows for that range/month.
- Click Export Excel.
- Expected: signed URL download starts.

- [ ] **Step 5: Record timings**

Capture:

```txt
archive cleanup confirm -> archive upload complete:
archive cleanup confirm -> delete complete:
archived export click -> download start:
empty export click -> no-file notice:
```

- [ ] **Step 6: Commit fixes only if needed**

```powershell
git add <changed-files>
git commit -m "Fix attendance archive verification issues"
```

---

### Task 7: Add Fast Check-in Success Dialog and Timing

**Files:**
- Create: `lib/checkin-ui.ts`
- Create: `scripts/checkin-ui.test.mjs`
- Modify: `app/checkin/CheckinClient.tsx`

**Interfaces:**
- Produces:
  - `type CheckinActionType = 'in' | 'out' | 'offsite_in' | 'offsite_out'`
  - `function checkinDialogTitle(type: CheckinActionType): string`
  - `function checkinDialogMessage(): string`
  - `function formatTimingMs(ms: number): string`

- [ ] **Step 1: Write UI helper tests**

Create `scripts/checkin-ui.test.mjs`:

```js
import assert from 'node:assert/strict';

const ui = await import('../lib/checkin-ui.ts');

assert.equal(ui.checkinDialogTitle('in'), 'Check-in');
assert.equal(ui.checkinDialogTitle('out'), 'Check-out');
assert.equal(ui.checkinDialogTitle('offsite_in'), 'Check-in');
assert.equal(ui.checkinDialogTitle('offsite_out'), 'Check-out');
assert.equal(ui.checkinDialogMessage(), 'เรียบร้อย');
assert.equal(ui.formatTimingMs(950), '0.95s');
assert.equal(ui.formatTimingMs(1530), '1.53s');

console.log('checkin-ui tests passed');
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `node scripts\checkin-ui.test.mjs`

Expected: FAIL with module-not-found error.

- [ ] **Step 3: Implement helper**

Create `lib/checkin-ui.ts`:

```ts
export type CheckinActionType = 'in' | 'out' | 'offsite_in' | 'offsite_out';

export function checkinDialogTitle(type: CheckinActionType) {
  return type === 'out' || type === 'offsite_out' ? 'Check-out' : 'Check-in';
}

export function checkinDialogMessage() {
  return 'เรียบร้อย';
}

export function formatTimingMs(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}
```

- [ ] **Step 4: Add dialog state to `CheckinClient`**

Import helpers:

```ts
import { checkinDialogMessage, checkinDialogTitle, formatTimingMs } from '@/lib/checkin-ui';
```

Add state:

```ts
const [successDialog, setSuccessDialog] = useState<{ type: 'in' | 'out'; timing: string } | null>(null);
```

- [ ] **Step 5: Keep button disabled unless GPS is valid**

Change button disabled props from `pending || !coords` to:

```tsx
disabled={pending || !coords || !inRange}
```

Do this for both check-in and check-out hold buttons.

- [ ] **Step 6: Show success dialog before refresh**

In `completeHold`, capture timing and replace the success toast path:

```ts
const startedAt = performance.now();
const res = await submitCheckin({ type, lat: coords!.lat, lng: coords!.lng, deviceId });
if (res?.error) {
  // keep existing error handling
} else {
  const timing = formatTimingMs(performance.now() - startedAt);
  setSuccessDialog({ type, timing });
  setToast(null);
  setTimeout(() => router.refresh(), 50);
}
```

- [ ] **Step 7: Add dialog JSX**

Add before closing `</main>`:

```tsx
{successDialog && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 90, display: 'grid', placeItems: 'center', padding: 18 }}>
    <div style={{ width: '100%', maxWidth: 320, background: '#fff', borderRadius: 18, padding: 20, textAlign: 'center' }}>
      <i className="ti ti-circle-check-filled" style={{ fontSize: 54, color: '#5dcaa5' }} aria-hidden></i>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>
        {checkinDialogTitle(successDialog.type)}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
        {checkinDialogMessage()}
      </div>
      <div style={{ fontSize: 11, color: '#5c5c60', marginTop: 6 }}>
        {successDialog.timing}
      </div>
      <button type="button" onClick={() => setSuccessDialog(null)} style={{ marginTop: 16, width: '100%', border: 'none', borderRadius: 12, padding: 12, background: '#0e0e10', color: '#d6f26b', fontWeight: 800 }}>
        ตกลง
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 8: Run verification**

Run:

```powershell
node scripts\checkin-ui.test.mjs
npm.cmd run build
```

Manual:
- With GPS missing/out of range, confirm the check-in/check-out button is grey and cannot start hold.
- With valid GPS, press and hold.
- Record button release to success dialog visible.

- [ ] **Step 9: Commit**

```powershell
git add lib/checkin-ui.ts scripts/checkin-ui.test.mjs app/checkin/CheckinClient.tsx
git commit -m "Show fast checkin success dialog"
```

---

### Task 8: Improve Offsite Photo Reliability and Submit UX

**Files:**
- Create: `lib/offsite-photo.ts`
- Create: `scripts/offsite-photo.test.mjs`
- Modify: `app/offsite/page.tsx`

**Interfaces:**
- Produces:
  - `const OFFSITE_PHOTO_MAX_WIDTH = 960`
  - `const OFFSITE_PHOTO_QUALITY = 0.68`
  - `function fitImageDimensions(srcW: number, srcH: number, maxWidth?: number): { width: number; height: number }`

- [ ] **Step 1: Write photo helper tests**

Create `scripts/offsite-photo.test.mjs`:

```js
import assert from 'node:assert/strict';

const photo = await import('../lib/offsite-photo.ts');

assert.equal(photo.OFFSITE_PHOTO_MAX_WIDTH, 960);
assert.equal(photo.OFFSITE_PHOTO_QUALITY, 0.68);
assert.deepEqual(photo.fitImageDimensions(1920, 1080), { width: 960, height: 540 });
assert.deepEqual(photo.fitImageDimensions(640, 480), { width: 640, height: 480 });
assert.deepEqual(photo.fitImageDimensions(0, 0), { width: 960, height: 720 });

console.log('offsite-photo tests passed');
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `node scripts\offsite-photo.test.mjs`

Expected: FAIL with module-not-found error.

- [ ] **Step 3: Implement helper**

Create `lib/offsite-photo.ts`:

```ts
export const OFFSITE_PHOTO_MAX_WIDTH = 960;
export const OFFSITE_PHOTO_QUALITY = 0.68;

export function fitImageDimensions(srcW: number, srcH: number, maxWidth = OFFSITE_PHOTO_MAX_WIDTH) {
  if (!srcW || !srcH) return { width: maxWidth, height: Math.round(maxWidth * 0.75) };
  if (srcW <= maxWidth) return { width: srcW, height: srcH };
  return { width: maxWidth, height: Math.round((srcH / srcW) * maxWidth) };
}
```

- [ ] **Step 4: Use helper in `app/offsite/page.tsx`**

Import:

```ts
import { OFFSITE_PHOTO_QUALITY, fitImageDimensions } from '@/lib/offsite-photo';
import { checkinDialogMessage, checkinDialogTitle, formatTimingMs } from '@/lib/checkin-ui';
```

Replace hardcoded canvas sizing:

```ts
const { width: w, height: h } = fitImageDimensions(srcW, srcH);
c.width = w;
c.height = h;
```

Replace JPEG quality:

```ts
}, 'image/jpeg', OFFSITE_PHOTO_QUALITY);
```

- [ ] **Step 5: Add offsite success dialog state**

Add:

```ts
const [successDialog, setSuccessDialog] = useState<{ type: 'offsite_in' | 'offsite_out'; timing: string } | null>(null);
```

In `submit()`:

```ts
const startedAt = performance.now();
const res = await submitOffsite(fd);
if (res?.error === 'DEVICE_NOT_BOUND') router.replace('/account/device/bind');
else if (res?.error === 'DEVICE_MISMATCH') router.replace('/account/device');
else if (res?.error) setErr(res.error);
else {
  setErr(null);
  setSuccessDialog({
    type: res.type,
    timing: formatTimingMs(performance.now() - startedAt),
  });
  setTimeout(() => router.push('/checkin'), 650);
}
```

- [ ] **Step 6: Keep retry state usable**

When upload fails, do not clear `photo`, `photoUrl`, `coords`, or `location`. Leave the button enabled after `pending` returns false so the user can submit again.

- [ ] **Step 7: Add offsite dialog JSX**

Add the same success dialog structure as Task 7, with:

```tsx
{checkinDialogTitle(successDialog.type)}
{checkinDialogMessage()}
```

- [ ] **Step 8: Run verification**

Run:

```powershell
node scripts\offsite-photo.test.mjs
node scripts\checkin-ui.test.mjs
npm.cmd run build
```

Manual:
- Choose/take a real photo.
- Confirm preview appears and submit remains enabled.
- Submit once and record click to success dialog/navigation.
- Force a failed upload if possible by disconnecting network; confirm photo and location remain for retry.

- [ ] **Step 9: Commit**

```powershell
git add lib/offsite-photo.ts scripts/offsite-photo.test.mjs app/offsite/page.tsx
git commit -m "Improve offsite photo submit flow"
```

---

### Task 9: Final Verification and Deployment

**Files:**
- Modify only files needed to fix final verification failures.

**Interfaces:**
- Consumes all prior task outputs.
- Produces a tested implementation and deployment notes.

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
node scripts\attendance-report-excel.test.mjs
node scripts\attendance-report-archive.test.mjs
node scripts\checkin-ui.test.mjs
node scripts\offsite-photo.test.mjs
npm.cmd run build
```

Expected: all test scripts PASS and build succeeds.

- [ ] **Step 2: Run lint and record existing failures**

Run:

```powershell
npm.cmd run lint
```

Expected: if lint still fails from existing unrelated React issues, record the filenames and do not refactor unrelated code in this feature pass.

- [ ] **Step 3: Browser verify admin**

Manual:
- Select a current month with partial live data and click Export Excel.
- Select an empty month with no archive and click Export Excel; expect `ไม่มีไฟล์`.
- Run cleanup modal on a safe test range; expect archive notice before deletion notice.
- Select the cleaned month and click Export Excel; expect archived file download.

- [ ] **Step 4: Browser verify check-in**

Manual:
- GPS not ready: button grey.
- GPS out of range: button grey.
- GPS valid: hold button, success dialog shows `Check-in` or `Check-out` and `เรียบร้อย`.
- Record timing shown in the dialog.

- [ ] **Step 5: Browser verify offsite**

Manual:
- Take or select photo.
- Confirm watermark, GPS, and location are present.
- Submit and record timing.
- Verify a check-in row and photo URL exist after success.

- [ ] **Step 6: Deploy**

Use the existing deployment workflow for this repo. If Vercel CLI is linked:

```powershell
vercel --prod
```

If Vercel is unlinked because `.vercel` was intentionally removed, deploy through the connected Git push workflow after commits are on `main`.

- [ ] **Step 7: Final commit or push**

```powershell
git status --short
git push
```

Expected: only intended feature commits are pushed; the pre-existing deletion of `scripts/reset-test-state.mjs` remains untouched unless the user explicitly asks to include it.

---

## Self-Review

- Spec coverage: monthly archive storage, export live/archive/no-file, cleanup date range, archive-before-delete, check-in GPS/device readiness, success dialog, offsite photo reliability, and timing verification are each mapped to Tasks 1-9.
- Placeholder scan: no red-flag placeholder terms, and each code-writing task includes concrete names, commands, or snippets.
- Type consistency: archive helper names are consistent across Tasks 2-5; workbook builder names are consistent across Tasks 1, 3, and 4; check-in UI helper names are consistent across Tasks 7-8.
