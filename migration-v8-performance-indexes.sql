-- v8: Performance indexes for admin monthly dashboard and pending device requests.
-- Run in Supabase SQL Editor.

create index if not exists idx_checkins_ts_desc
  on checkins (ts desc);

create index if not exists idx_device_requests_status_created_at
  on device_requests (status, created_at desc);
