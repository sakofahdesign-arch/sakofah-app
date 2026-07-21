'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type OffsiteType = 'offsite_in' | 'offsite_out';

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

function duplicateOffsiteMessage(type: OffsiteType) {
  return type === 'offsite_in'
    ? 'วันนี้คุณเช็คอินไปแล้ว'
    : 'วันนี้คุณเช็คเอาท์ไปแล้ว';
}

export async function submitOffsite(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' };

  const { data: emp } = await supabase
    .from('employees')
    .select('emp_id, role, active, device_id')
    .eq('id', user.id)
    .single();

  if (!emp || !emp.active) return { error: 'ไม่พบข้อมูลพนักงาน' };
  const deviceId = (formData.get('deviceId') as string)?.trim();
  if (emp.role !== 'admin') {
    if (!emp.device_id) return { error: 'DEVICE_NOT_BOUND' };
    if (!deviceId || emp.device_id !== deviceId) return { error: 'DEVICE_MISMATCH' };
  }

  // Auto-detect direction from today's checkins
  const today = getBangkokDayRange();
  const { data: todays } = await supabase
    .from('checkins')
    .select('type')
    .eq('emp_id', emp.emp_id)
    .gte('ts', today.start)
    .lte('ts', today.end);

  const types = (todays ?? []).map((r) => r.type);
  const hasIn = types.includes('in') || types.includes('offsite_in');
  const hasOut = types.includes('out') || types.includes('offsite_out');

  if (hasOut) return { error: 'วันนี้ลงเวลาออกครบแล้ว' };

  const type: OffsiteType = hasIn ? 'offsite_out' : 'offsite_in';

  const photo = formData.get('photo') as File;
  const lat = parseFloat(formData.get('lat') as string);
  const lng = parseFloat(formData.get('lng') as string);
  const location = (formData.get('location') as string)?.trim();

  if (!photo || photo.size === 0) return { error: 'กรุณาถ่ายรูปยืนยัน' };
  if (!location) return { error: 'กรุณากรอกสถานที่ปฏิบัติงาน' };
  if (isNaN(lat) || isNaN(lng)) return { error: 'ไม่พบพิกัด GPS' };

  const filename = `${emp.emp_id}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from('checkin-photos')
    .upload(filename, photo, { contentType: 'image/jpeg', upsert: false });

  if (upErr) return { error: 'อัปโหลดรูปไม่สำเร็จ: ' + upErr.message };

  const { data: pub } = supabase.storage.from('checkin-photos').getPublicUrl(filename);

  const { error } = await supabase.from('checkins').insert({
    emp_id: emp.emp_id,
    type,
    lat, lng,
    photo_url: pub.publicUrl,
    location_note: location,
    status: 'approved',
  });

  if (error) {
    await supabase.storage.from('checkin-photos').remove([filename]);
    if (error.code === '23505') return { error: duplicateOffsiteMessage(type) };
    return { error: error.message };
  }

  revalidatePath('/checkin');
  return { ok: true, type };
}
