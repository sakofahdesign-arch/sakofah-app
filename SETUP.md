# Sakofah Islamic — ระบบลงเวลาพนักงาน

## วิธีติดตั้ง

### 1. สมัคร Supabase (5 นาที)
1. ไปที่ https://supabase.com → Start your project
2. login ด้วย GitHub
3. New Project: name=`sakofah-app`, password=ตั้งให้ยาว, region=`Singapore`
4. รอ ~2 นาที

### 2. รัน SQL Schema
- ในแถบซ้าย Supabase → **SQL Editor** → **New query**
- เปิดไฟล์ `supabase-schema.sql` ในโปรเจกต์นี้ → copy ทั้งหมด → paste → กด **Run**
- ตรวจ: Table Editor ควรเห็นตาราง employees, checkins, settings, device_requests

### 3. ใส่ค่า API
- Supabase → **Project Settings** (⚙️) → **API**
- copy 2 ค่า แล้วแก้ไฟล์ `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 4. สร้างผู้ใช้คนแรก (Admin)
**a. สร้าง auth user:**
- Supabase → **Authentication** → **Users** → **Add user** → Create new user
- Email: `admin@sakofah.local`
- Password: ตั้งรหัส (ใช้รหัสนี้ login)
- ✅ Auto Confirm User
- คัดลอก User UID ที่ได้

**b. เพิ่มข้อมูลในตาราง employees:**
- Table Editor → `employees` → Insert row:
  - `id`: paste User UID จากข้อ a
  - `emp_id`: `ADMIN`
  - `name`: ชื่อ admin
  - `role`: `admin`
  - `active`: true

### 5. รันแอป
```powershell
npm run dev
```
เปิด http://localhost:3000 → login ด้วย `ADMIN` + password

### 6. เพิ่มพนักงานคนอื่น
ทำซ้ำขั้นตอน 4 แต่:
- Email: `{emp_id}@sakofah.local` (เช่น `SKF-00428@sakofah.local`)
- role: `staff`

## วิธีใช้งาน

### พนักงาน
- เข้า `/checkin` → กดปุ่มใหญ่เช็คอิน (ต้องอยู่ในรัศมีออฟฟิศ)
- ลานอกสถานที่ → กด "ลานอกสถานที่" → ถ่ายรูป + กรอกสถานที่ → ส่ง

### Admin
- เข้า `/admin` → ดูรายงานเดือน, อนุมัติ off-site
- เปลี่ยนเดือน: คลิก month picker บนขวา
- จัดการพนักงาน: Supabase Table Editor → employees

### Settings (พิกัดออฟฟิศ, รัศมี, Wi-Fi)
- Supabase Table Editor → `settings` → แก้ค่า:
  - `office_lat`, `office_lng`: พิกัดออฟฟิศ
  - `radius_m`: รัศมี (เมตร) เช่น 80
  - `allowed_ssid`: ชื่อ Wi-Fi
