'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const DEFAULT_RESET_PIN = '123456';

function chunks<T>(items: T[], size = 10) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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
