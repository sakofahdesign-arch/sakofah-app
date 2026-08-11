'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import {
  ATTENDANCE_ARCHIVE_BUCKET,
  makeArchiveStoragePath,
  validateSingleMonthDateRange,
} from '@/lib/attendance-report-archive';
import {
  buildAttendanceReportWorkbook,
  makeAttendanceReportFileName,
  type AttendanceReportCheckin,
  type AttendanceReportEmployee,
  type AttendanceReportSettings,
} from '@/lib/attendance-report-workbook';
import { fetchHrApprovedLeaves } from '@/lib/hr-leave-report';
import { revalidatePath } from 'next/cache';
import XLSX from 'xlsx-js-style';

const DEFAULT_RESET_PIN = '123456';
const CHECKIN_PHOTO_BUCKET = 'checkin-photos';

function chunks<T>(items: T[], size = 10) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function monthRange(monthStr: string) {
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

function photoPathFromPublicUrl(url: string | null) {
  if (!url) return null;
  const marker = `/${CHECKIN_PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: emp } = await supabase
    .from('employees')
    .select('role')
    .eq('id', user.id)
    .single();
  if (emp?.role !== 'admin') return null;
  return supabase;
}

export async function approveDeviceRequest(id: string) {
  const supabase = await requireAdmin();
  if (!supabase) return { error: 'ไม่มีสิทธิ์' };

  const { data: req } = await supabase
    .from('device_requests')
    .select('emp_id, new_device')
    .eq('id', id)
    .single();
  if (!req) return { error: 'ไม่พบคำขอ' };

  const { error: updEmp } = await supabase
    .from('employees')
    .update({ device_id: req.new_device })
    .eq('emp_id', req.emp_id);
  if (updEmp) return { error: updEmp.message };

  const { error } = await supabase
    .from('device_requests')
    .update({ status: 'approved', resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/admin');
  return { ok: true };
}

export async function rejectDeviceRequest(id: string) {
  const supabase = await requireAdmin();
  if (!supabase) return { error: 'ไม่มีสิทธิ์' };
  const { error } = await supabase
    .from('device_requests')
    .update({ status: 'rejected', resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { ok: true };
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function loadArchiveReportData(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  startIso: string,
  endExclusiveIso: string,
) {
  const [employeesRes, checkinsRes, settingsRes, branchesRes] = await Promise.all([
    admin
      .from('employees')
      .select('emp_id, name, role, active, branch, device_id')
      .order('emp_id'),
    admin
      .from('checkins')
      .select('id, emp_id, type, ts, lat, lng, photo_url, location_note, status, employees!inner(name, branch)')
      .gte('ts', startIso)
      .lt('ts', endExclusiveIso)
      .order('ts', { ascending: true }),
    admin.from('settings').select('*').limit(1).maybeSingle(),
    admin.from('branches').select('name').order('created_at', { ascending: true }),
  ]);

  if (employeesRes.error) throw new Error(employeesRes.error.message);
  if (checkinsRes.error) throw new Error(checkinsRes.error.message);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (branchesRes.error) throw new Error(branchesRes.error.message);

  const checkins = (checkinsRes.data ?? []).map((row) => {
    const employee = Array.isArray(row.employees) ? row.employees[0] : row.employees;
    return {
      ...row,
      employees: {
        name: employee?.name ?? '',
        branch: employee?.branch ?? null,
      },
    };
  }) as AttendanceReportCheckin[];

  return {
    employees: (employeesRes.data ?? []) as AttendanceReportEmployee[],
    checkins,
    settings: (settingsRes.data ?? null) as AttendanceReportSettings,
    branchNames: (branchesRes.data ?? []).map((row) => row.name).filter((name): name is string => Boolean(name)),
  };
}

export async function resetEmployeeAccess(empId: string) {
  const supabase = await requireAdmin();
  if (!supabase) return { error: 'ไม่มีสิทธิ์' };

  const cleanEmpId = empId.trim();
  if (!cleanEmpId) return { error: 'ไม่พบรหัสพนักงาน' };

  const admin = createAdminClient();
  if (!admin) return { error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY สำหรับรีเซ็ตรหัสผ่าน' };

  const { data: employee, error: empErr } = await admin
    .from('employees')
    .select('id, emp_id, name')
    .eq('emp_id', cleanEmpId)
    .single();
  if (empErr || !employee) return { error: empErr?.message ?? 'ไม่พบพนักงาน' };

  const { error: passwordErr } = await admin.auth.admin.updateUserById(employee.id, {
    password: DEFAULT_RESET_PIN,
  });
  if (passwordErr) return { error: passwordErr.message };

  const resetPayload = {
    device_id: null,
    device_bound_at: null,
    pin_changed: false,
  };

  let { error: resetErr } = await admin
    .from('employees')
    .update(resetPayload)
    .eq('emp_id', cleanEmpId);

  if (resetErr && /device_bound_at/i.test(resetErr.message)) {
    const fallback = await admin
      .from('employees')
      .update({ device_id: null, pin_changed: false })
      .eq('emp_id', cleanEmpId);
    resetErr = fallback.error;
  }
  if (resetErr) return { error: resetErr.message };

  await admin.from('device_requests').delete().eq('emp_id', cleanEmpId);

  revalidatePath('/admin');
  return { ok: true, message: `รีเซ็ต ${employee.name} แล้ว รหัสเริ่มต้นคือ ${DEFAULT_RESET_PIN}` };
}

export async function resetAllStaffAccess() {
  const supabase = await requireAdmin();
  if (!supabase) return { error: 'ไม่มีสิทธิ์' };

  const admin = createAdminClient();
  if (!admin) return { error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY สำหรับรีเซ็ตรหัสผ่าน' };

  const { data: employees, error: empErr } = await admin
    .from('employees')
    .select('id, emp_id, name')
    .eq('role', 'staff')
    .eq('active', true)
    .order('emp_id');
  if (empErr) return { error: empErr.message };
  if (!employees?.length) return { error: 'ไม่พบพนักงานสำหรับรีเซ็ต' };

  let passwordFailed = 0;
  for (const batch of chunks(employees, 10)) {
    const results = await Promise.all(
      batch.map((employee) =>
        admin.auth.admin.updateUserById(employee.id, { password: DEFAULT_RESET_PIN }),
      ),
    );
    passwordFailed += results.filter((result) => result.error).length;
  }
  if (passwordFailed > 0) return { error: `รีเซ็ตรหัสผ่านไม่สำเร็จ ${passwordFailed} คน` };

  const empIds = employees.map((employee) => employee.emp_id);
  const resetPayload = {
    device_id: null,
    device_bound_at: null,
    pin_changed: false,
  };

  let { error: resetErr } = await admin
    .from('employees')
    .update(resetPayload)
    .in('emp_id', empIds);

  if (resetErr && /device_bound_at/i.test(resetErr.message)) {
    const fallback = await admin
      .from('employees')
      .update({ device_id: null, pin_changed: false })
      .in('emp_id', empIds);
    resetErr = fallback.error;
  }
  if (resetErr) return { error: resetErr.message };

  await admin.from('device_requests').delete().in('emp_id', empIds);

  revalidatePath('/admin');
  return { ok: true, message: `รีเซ็ตพนักงาน ${employees.length} คนแล้ว รหัสเริ่มต้นคือ ${DEFAULT_RESET_PIN}` };
}

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
    const leaveRequests = await fetchHrApprovedLeaves(range.monthStr);
    const createdAt = new Date();
    const storagePath = makeArchiveStoragePath(range.monthStr, createdAt);
    const fileName = makeAttendanceReportFileName(range.monthStr);
    const wb = buildAttendanceReportWorkbook({
      ...reportData,
      adminName: user?.email ?? 'admin',
      monthStr: range.monthStr,
      leaveRequests,
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

    return {
      ok: true,
      monthStr: range.monthStr,
      checkinCount: reportData.checkins.length,
      photoCount,
      storagePath,
      fileName,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'สร้างไฟล์รายงานไม่สำเร็จ' };
  }
}

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
  if (signed.error || !signed.data?.signedUrl) {
    return { error: signed.error?.message ?? 'สร้างลิงก์ดาวน์โหลดไม่สำเร็จ' };
  }

  return { ok: true, url: signed.data.signedUrl, fileName: data.file_name };
}

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

export async function cleanupMonthlyCheckins(monthStr: string) {
  const range = monthRange(monthStr);
  if (!range) return { error: 'รูปแบบเดือนต้องเป็น YYYY-MM' };
  const [year, month] = monthStr.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return cleanupCheckinsInRange({
    dateFrom: `${monthStr}-01`,
    dateTo: `${monthStr}-${String(lastDay).padStart(2, '0')}`,
  });
}
