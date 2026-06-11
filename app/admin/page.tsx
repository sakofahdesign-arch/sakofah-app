import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
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

  const [empsRes, checkinsRes, settingsRes, deviceReqRes] = await Promise.all([
    supabase.from('employees').select('emp_id, name, role, active, branch, device_id'),
    supabase.from('checkins').select('*, employees!inner(name, branch)').gte('ts', start).lt('ts', end).order('ts', { ascending: false }),
    supabase.from('settings').select('*').single(),
    supabase.from('device_requests')
      .select('*, employees!inner(name, branch)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ]);

  return (
    <AdminClient
      adminName={me.name}
      monthStr={monthStr}
      employees={empsRes.data ?? []}
      checkins={checkinsRes.data ?? []}
      settings={settingsRes.data}
      deviceRequests={deviceReqRes.data ?? []}
    />
  );
}
