'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type CheckinInput = {
  type: 'in' | 'out';
  lat: number;
  lng: number;
  device_id: string;
  wifi_ssid?: string;
};

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function submitCheckin(input: CheckinInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' };

  if (!input.device_id) return { error: 'ไม่พบรหัสอุปกรณ์ — โปรดรีเฟรชหน้า' };

  const { data: emp } = await supabase
    .from('employees')
    .select('emp_id, active, device_id, branch')
    .eq('id', user.id)
    .single();

  if (!emp) return { error: 'ไม่พบข้อมูลพนักงาน' };
  if (!emp.active) return { error: 'บัญชีถูกระงับ' };

  // Device binding — ต้องผูกอุปกรณ์ผ่านหน้า onboarding ก่อน (ไม่ผูกแบบ lazy อีกต่อไป)
  if (!emp.device_id) {
    return { error: 'DEVICE_NOT_BOUND' };
  }
  if (emp.device_id !== input.device_id) {
    return { error: 'DEVICE_MISMATCH' };
  }

  // GPS check — ใช้พิกัดของสาขาที่พนักงานสังกัด (fallback เป็น settings global)
  let officeLat: number | null = null;
  let officeLng: number | null = null;
  let radius: number | null = null;
  let scopeLabel = 'ออฟฟิศ';

  if (emp.branch) {
    const { data: branch } = await supabase
      .from('branches')
      .select('lat, lng, radius_m')
      .eq('name', emp.branch)
      .single();
    if (branch) {
      officeLat = branch.lat;
      officeLng = branch.lng;
      radius = branch.radius_m;
      scopeLabel = emp.branch;
    }
  }

  if (officeLat === null || officeLng === null || radius === null) {
    const { data: settings } = await supabase
      .from('settings')
      .select('office_lat, office_lng, radius_m')
      .single();
    if (!settings) return { error: 'ไม่พบการตั้งค่าระบบหรือสาขา' };
    officeLat = settings.office_lat;
    officeLng = settings.office_lng;
    radius = settings.radius_m;
  }

  const dist = distanceMeters(input.lat, input.lng, officeLat!, officeLng!);

  if (dist > radius!) {
    return {
      error: `คุณอยู่นอกขอบเขตที่กำหนด (${Math.round(dist)} ม. จาก${scopeLabel} — เกินรัศมี ${radius!} ม.)`,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: todays } = await supabase
    .from('checkins')
    .select('type')
    .eq('emp_id', emp.emp_id)
    .gte('ts', `${today}T00:00:00`)
    .lte('ts', `${today}T23:59:59`);

  const types = (todays ?? []).map((r) => r.type);
  const hasAnyIn = types.includes('in') || types.includes('offsite_in');
  const hasAnyOut = types.includes('out') || types.includes('offsite_out');

  if (input.type === 'in' && hasAnyIn) {
    return { error: 'วันนี้คุณเช็คอินไปแล้ว (รวมเช็คอินนอกสถานที่)' };
  }
  if (input.type === 'out' && !hasAnyIn) {
    return { error: 'กรุณาเช็คอินก่อน' };
  }
  if (input.type === 'out' && hasAnyOut) {
    return { error: 'วันนี้คุณเช็คเอาท์ไปแล้ว' };
  }

  const { error } = await supabase.from('checkins').insert({
    emp_id: emp.emp_id,
    type: input.type,
    lat: input.lat,
    lng: input.lng,
    device_id: input.device_id,
    wifi_ssid: input.wifi_ssid ?? null,
    status: 'approved',
  });

  if (error) return { error: error.message };

  revalidatePath('/checkin');
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
