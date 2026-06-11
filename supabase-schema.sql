-- =======================================================
-- Sakofah Islamic - Check-in/Check-out Database Schema
-- รัน SQL นี้ใน Supabase: Dashboard -> SQL Editor -> New query
-- =======================================================

-- 1. EMPLOYEES TABLE
create table if not exists employees (
  id uuid primary key references auth.users(id) on delete cascade,
  emp_id text unique not null,
  name text not null,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  device_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. CHECKINS TABLE
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  emp_id text not null references employees(emp_id) on delete cascade,
  type text not null check (type in ('in', 'out', 'offsite_in', 'offsite_out')),
  ts timestamptz not null default now(),
  lat double precision,
  lng double precision,
  wifi_ssid text,
  ip_address text,
  device_id text,
  photo_url text,
  location_note text,
  status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_checkins_emp_id_ts on checkins(emp_id, ts desc);
create index if not exists idx_checkins_status on checkins(status);

-- 3. SETTINGS TABLE
create table if not exists settings (
  id int primary key default 1,
  office_lat double precision not null default 6.7184,
  office_lng double precision not null default 101.5482,
  radius_m int not null default 80,
  allowed_ssid text not null default 'SAKOFAH-OFFICE',
  work_start time not null default '07:30',
  work_end time not null default '16:30',
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into settings (id) values (1) on conflict do nothing;

-- 4. DEVICE CHANGE REQUESTS
create table if not exists device_requests (
  id uuid primary key default gen_random_uuid(),
  emp_id text not null references employees(emp_id) on delete cascade,
  old_device text,
  new_device text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- =======================================================
-- ROW LEVEL SECURITY (RLS)
-- =======================================================
alter table employees enable row level security;
alter table checkins enable row level security;
alter table settings enable row level security;
alter table device_requests enable row level security;

-- helper: check if current user is admin
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from employees
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- EMPLOYEES policies
drop policy if exists "view own profile" on employees;
create policy "view own profile" on employees for select
  using (id = auth.uid() or is_admin());

drop policy if exists "admin manages employees" on employees;
create policy "admin manages employees" on employees for all
  using (is_admin()) with check (is_admin());

-- CHECKINS policies
drop policy if exists "view own checkins" on checkins;
create policy "view own checkins" on checkins for select
  using (
    emp_id = (select emp_id from employees where id = auth.uid())
    or is_admin()
  );

drop policy if exists "create own checkin" on checkins;
create policy "create own checkin" on checkins for insert
  with check (
    emp_id = (select emp_id from employees where id = auth.uid())
  );

drop policy if exists "admin updates checkins" on checkins;
create policy "admin updates checkins" on checkins for update
  using (is_admin());

-- SETTINGS policies
drop policy if exists "anyone reads settings" on settings;
create policy "anyone reads settings" on settings for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin updates settings" on settings;
create policy "admin updates settings" on settings for update
  using (is_admin());

-- DEVICE REQUESTS policies
drop policy if exists "view own requests" on device_requests;
create policy "view own requests" on device_requests for select
  using (
    emp_id = (select emp_id from employees where id = auth.uid())
    or is_admin()
  );

drop policy if exists "create own request" on device_requests;
create policy "create own request" on device_requests for insert
  with check (
    emp_id = (select emp_id from employees where id = auth.uid())
  );

drop policy if exists "admin resolves requests" on device_requests;
create policy "admin resolves requests" on device_requests for update
  using (is_admin());

-- =======================================================
-- STORAGE BUCKET สำหรับรูป off-site
-- =======================================================
insert into storage.buckets (id, name, public)
values ('checkin-photos', 'checkin-photos', true)
on conflict do nothing;

drop policy if exists "auth users upload photos" on storage.objects;
create policy "auth users upload photos" on storage.objects for insert
  with check (bucket_id = 'checkin-photos' and auth.role() = 'authenticated');

drop policy if exists "anyone read photos" on storage.objects;
create policy "anyone read photos" on storage.objects for select
  using (bucket_id = 'checkin-photos');
