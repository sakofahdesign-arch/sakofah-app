-- v9: Update branch GPS coordinates.
-- Run in Supabase SQL Editor.

insert into branches (name, lat, lng, radius_m)
values
  ('สำนักงานใหญ่', 7.803235, 99.085919, 20),
  ('สาขากระบี่', 8.063564, 98.908573, 20),
  ('สาขาอ่าวลึก', 8.303262, 98.781841, 20),
  ('สาขากาญจนดิษฐ์', 9.148572, 99.393332, 20),
  ('สาขาคลองท่อม', 7.940006, 99.144035, 20),
  ('สาขาห้วยลึก', 7.759844, 99.241610, 20),
  ('สาขาเกาะลันตา', 7.594943, 99.034851, 20),
  ('สาขาเหนือคลอง', 8.021063, 98.995649, 20),
  ('สถานีบริการน้ำมันเชลล์', 7.811404, 99.091178, 20)
on conflict (name) do update
set
  lat = excluded.lat,
  lng = excluded.lng,
  radius_m = excluded.radius_m,
  updated_at = now();

update settings
set
  office_lat = 7.803235,
  office_lng = 99.085919,
  radius_m = 20,
  updated_at = now()
where id = 1;
