'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

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
