-- Monthly attendance report archive metadata and private storage bucket.

create table if not exists public.attendance_report_archives (
  id uuid primary key default gen_random_uuid(),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  date_from date not null,
  date_to date not null,
  storage_path text not null,
  file_name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  checkin_count int not null default 0 check (checkin_count >= 0),
  photo_count int not null default 0 check (photo_count >= 0),
  check (date_to >= date_from)
);

create unique index if not exists attendance_report_archives_storage_path_key
  on public.attendance_report_archives(storage_path);

create index if not exists attendance_report_archives_month_created_at_idx
  on public.attendance_report_archives(month, created_at desc);

alter table public.attendance_report_archives enable row level security;

grant select, insert, update, delete on public.attendance_report_archives to service_role;
grant select on public.attendance_report_archives to authenticated;

drop policy if exists "Admins can read attendance report archives" on public.attendance_report_archives;
create policy "Admins can read attendance report archives"
  on public.attendance_report_archives
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.employees
      where employees.id = (select auth.uid())
        and employees.role = 'admin'
    )
  );

insert into storage.buckets (id, name, public)
values ('attendance-report-archives', 'attendance-report-archives', false)
on conflict (id) do update set public = false;
