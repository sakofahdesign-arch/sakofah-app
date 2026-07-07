import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('employees')
    .select('role, pin_changed, device_id')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'admin') redirect('/admin');

  // onboarding ตามลำดับ: เปลี่ยน PIN → ผูกเครื่อง → เช็คอิน
  if (profile && !profile.pin_changed) redirect('/account/pin');
  if (profile && profile.role !== 'admin' && !profile.device_id) redirect('/account/device/bind');
  redirect('/checkin');
}
