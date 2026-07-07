'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
  const empId = (formData.get('emp_id') as string)?.trim().toUpperCase();
  const pin = formData.get('pin') as string;
  const deviceId = (formData.get('device_id') as string)?.trim();
  const deviceLabel = (formData.get('device_label') as string)?.trim();

  if (!empId || !pin) {
    return { error: 'กรุณากรอกรหัสพนักงานและ PIN' };
  }
  if (!deviceId) {
    return { error: 'ไม่พบรหัสเครื่อง กรุณาเปิดเว็บใหม่อีกครั้ง' };
  }

  const supabase = await createClient();
  const email = `${empId.toLowerCase()}@sakofah.local`;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: pin,
  });

  if (error) {
    return { error: 'รหัสพนักงานหรือ PIN ไม่ถูกต้อง' };
  }

  const { data: emp } = await supabase
    .from('employees')
    .select('role, active, device_id')
    .eq('emp_id', empId)
    .single();

  if (!emp || !emp.active) {
    await supabase.auth.signOut();
    return { error: 'ไม่พบข้อมูลพนักงานหรือบัญชีถูกระงับ' };
  }

  if (emp.role !== 'admin') {
    if (!emp.device_id) {
      const { data: bindStatus, error: bindErr } = await supabase.rpc('bind_my_device', { p_device: deviceId });
      if (bindErr) {
        await supabase.auth.signOut();
        return { error: bindErr.message };
      }
      if (bindStatus !== 'ok') {
        await supabase.auth.signOut();
        return { error: 'ผูกเครื่องไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ' };
      }
    } else if (emp.device_id !== deviceId) {
      return {
        error: `เครื่องนี้ยังไม่ได้รับอนุญาต${deviceLabel ? ` (${deviceLabel})` : ''} กำลังพาไปหน้าขอเปลี่ยนเครื่อง`,
        deviceMismatch: true,
      };
    }
  }

  redirect('/');
}
