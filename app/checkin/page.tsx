import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CheckinClient from './CheckinClient';

export default async function CheckinPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: emp } = await supabase
    .from('employees')
    .select('emp_id, name, role, device_id')
    .eq('id', user.id)
    .single();

  if (!emp) {
    return (
      <main style={{ padding: 20 }}>
        <div className="card-dark" style={{ borderRadius: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>ยังไม่ได้ลงทะเบียนพนักงาน</div>
          <div className="t-d-2" style={{ fontSize: 13 }}>
            กรุณาติดต่อฝ่ายบุคคลเพื่อสร้างข้อมูลในตาราง employees
          </div>
        </div>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: todayCheckins } = await supabase
    .from('checkins')
    .select('type, ts')
    .eq('emp_id', emp.emp_id)
    .gte('ts', `${today}T00:00:00`)
    .lte('ts', `${today}T23:59:59`)
    .order('ts');

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .single();

  return (
    <CheckinClient
      empName={emp.name}
      empId={emp.emp_id}
      role={emp.role}
      registeredDeviceId={emp.device_id}
      todayCheckins={todayCheckins ?? []}
      settings={settings}
    />
  );
}
