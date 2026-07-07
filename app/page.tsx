import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('employees')
    .select('role, pin_changed')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'admin') redirect('/admin');

  // onboarding ตามลำดับ: เปลี่ยน PIN → เช็คอิน
  if (profile && !profile.pin_changed) redirect('/account/pin');
  redirect('/checkin');
}
