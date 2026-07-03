-- v6: Device binding — บังคับ 1 อุปกรณ์ = 1 พนักงาน (onboarding ผูกเครื่องแบบปลอดภัย)
-- รัน SQL นี้ใน Supabase SQL Editor
--
-- แก้ช่องโหว่: เดิม submitCheckin ผูกอุปกรณ์แบบ lazy ด้วย session ของ staff
-- แต่ RLS ของ employees อนุญาต UPDATE เฉพาะ admin → ถูกบล็อกเงียบ device_id เป็น null ตลอด
-- → mismatch ไม่เคยทำงาน ใครก็เช็คอินแทนได้
-- ทางแก้: ผูกผ่าน function security definer + unique index

-- 1. คอลัมน์เวลาที่ผูกอุปกรณ์ (audit)
alter table employees add column if not exists device_bound_at timestamptz;

-- 2. ROLLOUT: รีเซ็ตการผูกอุปกรณ์ของทุกคน ให้ผูกใหม่ผ่าน flow ใหม่
--    ⚠️ ลบการผูกเดิมทั้งหมด — จำเป็นเพื่อให้ unique index สร้างผ่าน (กันกรณี device_id ซ้ำจากการทดสอบ)
update employees set device_id = null, device_bound_at = null;

-- 3. บังคับ 1 อุปกรณ์/คน ที่ระดับ DB (ยอมให้ null ซ้ำได้)
create unique index if not exists employees_device_id_unique
  on employees (device_id) where device_id is not null;

-- 4. ฟังก์ชันผูกอุปกรณ์ — security definer เพื่อ bypass RLS แบบควบคุม
--    (แก้ได้เฉพาะ device_id ของตัวเอง ห้ามแตะ role/คอลัมน์อื่น)
create or replace function bind_my_device(p_device text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id text;
  v_taken int;
begin
  if p_device is null or length(trim(p_device)) = 0 then
    return 'no_emp';
  end if;

  select device_id into v_device_id from employees where id = auth.uid();
  if not found then
    return 'no_emp';
  end if;

  -- บัญชีนี้ผูกกับเครื่องอื่นอยู่แล้ว → ต้องขอเปลี่ยนเครื่อง (ห้ามผูกทับเอง)
  if v_device_id is not null and v_device_id <> p_device then
    return 'already_bound_other';
  end if;

  -- ผูกไปแล้วกับเครื่องนี้ → idempotent
  if v_device_id = p_device then
    return 'ok';
  end if;

  -- อุปกรณ์นี้ถูกผูกกับพนักงานคนอื่นแล้ว
  select count(*) into v_taken from employees
    where device_id = p_device and id <> auth.uid();
  if v_taken > 0 then
    return 'taken';
  end if;

  update employees
    set device_id = p_device, device_bound_at = now()
    where id = auth.uid();
  return 'ok';
exception
  when unique_violation then
    -- race: มีคนผูกอุปกรณ์นี้ตัดหน้าไปพอดี
    return 'taken';
end;
$$;

grant execute on function bind_my_device(text) to authenticated;
