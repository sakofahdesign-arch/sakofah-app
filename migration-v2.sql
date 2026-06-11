-- v2: เพิ่มฟิลด์เวลาทำการรายวัน + tolerance สาย + camera flip flag
-- รัน SQL นี้ใน Supabase SQL Editor

-- เพิ่มฟิลด์ใหม่ใน settings
alter table settings
  add column if not exists late_tolerance_min int not null default 5,
  add column if not exists work_days text not null default 'MTWTF';

-- อัปเดตเวลาทำการตามที่ตั้งไว้
update settings
  set work_start = '08:20',
      work_end = '16:30',
      late_tolerance_min = 5,
      work_days = 'MTWTF'
  where id = 1;
