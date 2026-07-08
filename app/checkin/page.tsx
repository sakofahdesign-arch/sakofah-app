import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CheckinClient from './CheckinClient';

function getBangkokDayRange(date = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return {
    start: new Date(`${ymd}T00:00:00.000+07:00`).toISOString(),
    end: new Date(`${ymd}T23:59:59.999+07:00`).toISOString(),
  };
}

export default async function CheckinPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: emp } = await supabase
    .from('employees')
    .select('emp_id, name, role, pin_changed, device_id, branch')
    .eq('id', user.id)
    .single();

  // onboarding guard: เปลี่ยน PIN → ผูกเครื่อง ก่อนถึงจะเช็คอินได้
  if (emp && !emp.pin_changed) redirect('/account/pin');
  if (emp && emp.role !== 'admin' && !emp.device_id) redirect('/account/device/bind');

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

  const today = getBangkokDayRange();
  const { data: todayCheckins } = await supabase
    .from('checkins')
    .select('type, ts')
    .eq('emp_id', emp.emp_id)
    .gte('ts', today.start)
    .lte('ts', today.end)
    .order('ts');

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .single();

  let checkinLocation = settings
    ? {
        label: 'office',
        lat: settings.office_lat,
        lng: settings.office_lng,
        radius_m: settings.radius_m,
      }
    : null;

  if (emp.branch) {
    const { data: branch } = await supabase
      .from('branches')
      .select('name, lat, lng, radius_m')
      .eq('name', emp.branch)
      .maybeSingle();

    if (branch) {
      checkinLocation = {
        label: branch.name,
        lat: branch.lat,
        lng: branch.lng,
        radius_m: branch.radius_m,
      };
    }
  }

  return (
    <CheckinClient
      empName={emp.name}
      empId={emp.emp_id}
      role={emp.role}
      todayCheckins={todayCheckins ?? []}
      settings={settings}
      checkinLocation={checkinLocation}
    />
  );
}
