import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import BindClient from './BindClient';

export default async function BindDevicePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: emp } = await supabase
    .from('employees')
    .select('emp_id, name, line_user_id, pin_changed, branch')
    .eq('id', user.id)
    .single();

  // ต้องเปลี่ยน PIN ก่อนถึงจะผูก LINE ได้
  if (emp && !emp.pin_changed) redirect('/account/pin');

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

  // ผูก LINE ไปแล้ว → ไปหน้าเช็คอิน
  if (emp.line_user_id) redirect('/checkin');

  // พิกัดสาขา (fallback settings global) สำหรับสเต็ปตรวจสอบที่ตั้ง
  let office: { lat: number; lng: number; radius_m: number; ssid: string | null } | null = null;
  if (emp.branch) {
    const { data: branch } = await supabase
      .from('branches')
      .select('lat, lng, radius_m, allowed_ssid')
      .eq('name', emp.branch)
      .single();
    if (branch) office = { lat: branch.lat, lng: branch.lng, radius_m: branch.radius_m, ssid: branch.allowed_ssid };
  }
  if (!office) {
    const { data: settings } = await supabase
      .from('settings')
      .select('office_lat, office_lng, radius_m, allowed_ssid')
      .single();
    if (settings) office = { lat: settings.office_lat, lng: settings.office_lng, radius_m: settings.radius_m, ssid: settings.allowed_ssid };
  }

  return (
    <BindClient
      empId={emp.emp_id}
      branchName={emp.branch ?? 'สำนักงานใหญ่'}
      office={office}
    />
  );
}
