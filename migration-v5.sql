-- v5: Multi-branch support + department column for Sakofah
-- รัน SQL นี้ใน Supabase SQL Editor

-- 1. เพิ่ม department column ใน employees (ตำแหน่งงาน)
alter table employees add column if not exists department text;

-- 2. สร้างตาราง branches (สาขา + พิกัด GPS)
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  lat double precision not null,
  lng double precision not null,
  radius_m int not null default 80,
  allowed_ssid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table branches enable row level security;

drop policy if exists "anyone reads branches" on branches;
create policy "anyone reads branches" on branches for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin manages branches" on branches;
create policy "admin manages branches" on branches for all
  using (is_admin()) with check (is_admin());

-- เปิด realtime ให้ branches ด้วย
alter publication supabase_realtime add table branches;
