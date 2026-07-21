-- v10: Prevent duplicate daily check-ins/check-outs per employee.
-- Run in Supabase SQL Editor.

create unique index if not exists checkins_one_in_per_emp_bangkok_day
  on checkins (emp_id, ((ts at time zone 'Asia/Bangkok')::date))
  where type in ('in', 'offsite_in');

create unique index if not exists checkins_one_out_per_emp_bangkok_day
  on checkins (emp_id, ((ts at time zone 'Asia/Bangkok')::date))
  where type in ('out', 'offsite_out');
