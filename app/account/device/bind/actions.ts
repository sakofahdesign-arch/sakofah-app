'use server';

import { createClient } from '@/lib/supabase/server';
import { verifyLineIdToken } from '@/lib/line';

export type BindResult = 'ok' | 'taken' | 'already_bound_other' | 'no_emp' | 'unverified' | 'error';

export async function bindLine(idToken: string | null): Promise<{ status: BindResult; message?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'no_emp' };

  // ยืนยัน LINE ฝั่ง server → ได้ userId ที่เชื่อถือได้
  const lineUserId = await verifyLineIdToken(idToken);
  if (!lineUserId) return { status: 'unverified' };

  const { data, error } = await supabase.rpc('bind_my_line', { p_line_user_id: lineUserId });
  if (error) return { status: 'error', message: error.message };

  return { status: (data as BindResult) ?? 'error' };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
