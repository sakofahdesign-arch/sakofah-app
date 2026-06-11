import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AdminClient from './AdminClient';

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('employees').select('role, name').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/checkin');

  const sp = await searchParams;
  const now = new Date();
  const monthStr = sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(y, m - 1, 1).toISOString();
  const end = new Date(y, m, 1).toISOString();

  const [empsRes, checkinsRes, pendingRes] = await Promise.all([
    supabase.from('employees').select('emp_id, name, role, active'),
    supabase.from('checkins').select('*').gte('ts', start).lt('ts', end),
    supabase.from('checkins').select('*, employees!inner(name)').eq('status', 'pending').order('ts', { ascending: false }),
  ]);

  return (
    <AdminClient
      adminName={me.name}
      monthStr={monthStr}
      employees={empsRes.data ?? []}
      checkins={checkinsRes.data ?? []}
      pending={pendingRes.data ?? []}
    />
  );
}
