import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DeviceBindClient from './DeviceBindClient';

export default async function BindDevicePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: emp } = await supabase
    .from('employees')
    .select('emp_id, name, role, device_id, pin_changed')
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

  if (!emp.pin_changed) redirect('/account/pin');
  if (emp.role === 'admin') redirect('/admin');

  return (
    <DeviceBindClient
      empId={emp.emp_id}
      empName={emp.name}
      boundDeviceId={emp.device_id}
    />
  );
}
