'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function submitOffsite(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' };

  const { data: emp } = await supabase
    .from('employees')
    .select('emp_id, active')
    .eq('id', user.id)
    .single();

  if (!emp || !emp.active) return { error: 'ไม่พบข้อมูลพนักงาน' };

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
    type: 'offsite_in',
    lat, lng,
    photo_url: pub.publicUrl,
    location_note: location,
    status: 'pending',
  });

  if (error) return { error: error.message };

  revalidatePath('/checkin');
  return { ok: true };
}
