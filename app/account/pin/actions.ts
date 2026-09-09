'use server';

import { createClient } from '@/lib/supabase/server';

export async function changePin({
  empId,
  oldPin,
  newPin,
}: {
  empId?: string;
  oldPin: string;
  newPin: string;
}) {
  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    const normalizedEmpId = empId?.trim().toLowerCase();
    if (!normalizedEmpId) {
      return { error: 'ไม่ได้เข้าสู่ระบบ' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: `${normalizedEmpId}@sakofah.local`,
      password: oldPin,
    });
    if (error || !data.user?.email) {
      return { error: 'PIN เดิมไม่ถูกต้อง' };
    }
    user = data.user;
  }

  const email = user.email;
  if (!email) {
    return { error: 'ไม่ได้เข้าสู่ระบบ' };
  }

  const { error: signinErr } = await supabase.auth.signInWithPassword({
    email,
    password: oldPin,
  });
  if (signinErr) {
    return { error: 'PIN เดิมไม่ถูกต้อง' };
  }

  const { error } = await supabase.auth.updateUser({ password: newPin });
  if (error) {
    return { error: error.message };
  }

  const { error: markErr } = await supabase.rpc('mark_pin_changed');
  if (markErr) {
    return { error: markErr.message };
  }

  return { ok: true };
}
