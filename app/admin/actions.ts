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

export async function approveOffsite(id: string) {
  const supabase = await requireAdmin();
  if (!supabase) return { error: 'ไม่มีสิทธิ์' };
  const { error } = await supabase.from('checkins').update({ status: 'approved' }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { ok: true };
}

export async function rejectOffsite(id: string) {
  const supabase = await requireAdmin();
  if (!supabase) return { error: 'ไม่มีสิทธิ์' };
  const { error } = await supabase.from('checkins').update({ status: 'rejected' }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { ok: true };
}
