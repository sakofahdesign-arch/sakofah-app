'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
  const empId = (formData.get('emp_id') as string)?.trim().toUpperCase();
  const pin = formData.get('pin') as string;

  if (!empId || !pin) {
    return { error: 'กรุณากรอกรหัสพนักงานและ PIN' };
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

  redirect('/');
}
