-- v7: LINE identity binding + บังคับเปลี่ยน PIN
-- รัน SQL นี้ใน Supabase SQL Editor
--
-- แทนที่การผูกอุปกรณ์แบบ localStorage (v6) ด้วยการผูกกับบัญชี LINE (userId)
-- ซึ่งยืนยันฝั่ง server ด้วย LINE ID token → กันเช็คอินแทนกันได้จริง (1 LINE = 1 คน)

-- 1. คอลัมน์ใหม่
alter table employees add column if not exists line_user_id text;
alter table employees add column if not exists pin_changed boolean not null default false;

-- 2. บังคับ 1 บัญชี LINE = 1 พนักงาน (ยอมให้ null ซ้ำได้)
create unique index if not exists employees_line_user_id_unique
  on employees (line_user_id) where line_user_id is not null;

-- 3. ผูก LINE userId — security definer (bypass RLS แบบควบคุม, แก้ได้เฉพาะ line_user_id ของตัวเอง)
create or replace function bind_my_line(p_line_user_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line text;
  v_taken int;
begin
  if p_line_user_id is null or length(trim(p_line_user_id)) = 0 then
    return 'no_emp';
  end if;

  select line_user_id into v_line from employees where id = auth.uid();
  if not found then
    return 'no_emp';
  end if;

  -- บัญชีนี้ผูก LINE อื่นไว้แล้ว → ต้องให้แอดมินปลด
  if v_line is not null and v_line <> p_line_user_id then
    return 'already_bound_other';
  end if;

  -- ผูกไปแล้วกับ LINE นี้ → idempotent
  if v_line = p_line_user_id then
    return 'ok';
  end if;

  -- LINE นี้ถูกผูกกับพนักงานคนอื่นแล้ว
  select count(*) into v_taken from employees
    where line_user_id = p_line_user_id and id <> auth.uid();
  if v_taken > 0 then
    return 'taken';
  end if;

  update employees
    set line_user_id = p_line_user_id
    where id = auth.uid();
  return 'ok';
exception
  when unique_violation then
    return 'taken';
end;
$$;

grant execute on function bind_my_line(text) to authenticated;

-- 4. ทำเครื่องหมายว่าเปลี่ยน PIN แล้ว — security definer (RLS ห้าม staff อัปเดตแถวตัวเอง)
create or replace function mark_pin_changed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update employees set pin_changed = true where id = auth.uid();
end;
$$;

grant execute on function mark_pin_changed() to authenticated;
