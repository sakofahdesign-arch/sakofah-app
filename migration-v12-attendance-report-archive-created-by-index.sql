-- Index archive creator foreign key for Supabase performance advisor.

create index if not exists attendance_report_archives_created_by_idx
  on public.attendance_report_archives(created_by);
