'use server';

import { createClient } from '@/lib/supabase/server';

export type BindResult = 'ok' | 'taken' | 'already_bound_other' | 'no_emp' | 'error';

export async function bindDevice(deviceId: string): Promise<{ status: BindResult; message?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'no_emp' };

  if (!deviceId?.trim()) return { status: 'error', message: 'ไม่พบรหัสอุปกรณ์ — โปรดรีเฟรชหน้า' };

  const { data, error } = await supabase.rpc('bind_my_device', { p_device: deviceId });
  if (error) return { status: 'error', message: error.message };

  return { status: (data as BindResult) ?? 'error' };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
