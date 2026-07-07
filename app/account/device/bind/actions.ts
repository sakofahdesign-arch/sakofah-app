'use server';

import { createClient } from '@/lib/supabase/server';

export type BindDeviceResult = 'ok' | 'taken' | 'already_bound_other' | 'no_emp' | 'invalid' | 'error';

export async function bindDevice(deviceId: string | null): Promise<{ status: BindDeviceResult; message?: string }> {
  const device = deviceId?.trim();
  if (!device) return { status: 'invalid', message: 'ไม่พบรหัสเครื่อง' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('bind_my_device', { p_device: device });
  if (error) return { status: 'error', message: error.message };

  return { status: (data as BindDeviceResult) ?? 'error' };
}
