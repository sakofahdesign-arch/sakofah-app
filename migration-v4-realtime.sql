-- v4: เปิด Realtime สำหรับ table ที่ admin ต้องอัปเดตสด
-- รัน SQL นี้ใน Supabase SQL Editor

alter publication supabase_realtime add table device_requests;
alter publication supabase_realtime add table checkins;
