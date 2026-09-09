'use server';

import { createClient } from '@/lib/supabase/server';

export async function changePin({
  oldPin,
  newPin,
}: {
  oldPin: string;
  newPin: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: 'ไม่ได้เข้าสู่ระบบ' };
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
