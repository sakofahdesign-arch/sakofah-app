'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { submitCheckin, signOut } from './actions';

type Props = {
  empName: string;
  empId: string;
  role: string;
  todayCheckins: { type: string; ts: string }[];
  settings: { office_lat: number; office_lng: number; radius_m: number; allowed_ssid: string; work_start: string; work_end: string } | null;
};

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default function CheckinClient({ empName, empId, role, todayCheckins, settings }: Props) {
  const [now, setNow] = useState(new Date());
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('เบราเซอร์นี้ไม่รองรับ GPS');
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsError(null);
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const distance = coords && settings ? distanceMeters(coords.lat, coords.lng, settings.office_lat, settings.office_lng) : null;
  const inRange = distance !== null && settings ? distance <= settings.radius_m : false;

  const types = todayCheckins.map((c) => c.type);
  const hasCheckedIn = types.includes('in');
  const hasCheckedOut = types.includes('out');

  function handle(type: 'in' | 'out') {
    if (!coords) {
      setToast({ kind: 'err', msg: 'ยังหาตำแหน่ง GPS ไม่เจอ' });
      return;
    }
    startTransition(async () => {
      const res = await submitCheckin({ type, lat: coords.lat, lng: coords.lng });
      if (res?.error) setToast({ kind: 'err', msg: res.error });
      else {
        setToast({ kind: 'ok', msg: type === 'in' ? 'เช็คอินสำเร็จ ✓' : 'เช็คเอาท์สำเร็จ ✓' });
      }
    });
  }

  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <main style={{ minHeight: '100vh', maxWidth: 420, margin: '0 auto', padding: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div className="t-l-3" style={{ fontSize: 11 }}>อัสสลามุอะลัยกุม</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{empName}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {role === 'admin' && (
            <Link href="/admin" className="chip-dark" style={{ background: '#0e0e10', color: '#d6f26b', border: 'none', textDecoration: 'none' }}>
              <i className="ti ti-shield-check" style={{ fontSize: 12 }} aria-hidden></i>Admin
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" style={{
              background: 'transparent', border: '0.5px solid rgba(0,0,0,0.15)',
              borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer'
            }}>
              <i className="ti ti-logout" style={{ fontSize: 12 }} aria-hidden></i> ออก
            </button>
          </form>
        </div>
      </div>

      {/* Clock card */}
      <div className="card-lime" style={{ borderRadius: 24, marginBottom: 12 }}>
        <div className="t-l-2" style={{ fontSize: 11 }}>{dateStr}</div>
        <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: 1, lineHeight: 1 }}>{timeStr}</div>
        <div className="t-l-2" style={{ fontSize: 11, marginTop: 4 }}>
          เวลาทำการ {settings?.work_start.slice(0, 5)} – {settings?.work_end.slice(0, 5)}
        </div>
      </div>

      {/* Verification chips */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <VerifyCard
          ok={!!coords && inRange}
          label="พิกัด GPS"
          value={
            gpsError ? 'ผิดพลาด' :
            !coords ? 'กำลังค้นหา...' :
            inRange ? `ในขอบเขต · ${Math.round(distance!)} ม.` : `นอกขอบเขต · ${Math.round(distance!)} ม.`
          }
          icon="map-pin-check"
        />
        <VerifyCard
          ok={hasCheckedIn && !hasCheckedOut}
          warn={!hasCheckedIn}
          label="สถานะวันนี้"
          value={
            hasCheckedOut ? 'เช็คเอาท์แล้ว' :
            hasCheckedIn ? 'อยู่ในเวลาทำงาน' : 'ยังไม่เช็คอิน'
          }
          icon="clock"
        />
      </div>

      {/* Big action button */}
      {!hasCheckedIn ? (
        <button
          onClick={() => handle('in')}
          disabled={pending || !coords}
          className="card-dark"
          style={{
            border: 'none', width: '100%', textAlign: 'center',
            background: '#0e0e10', cursor: 'pointer', padding: 22, borderRadius: 24, color: 'white', marginBottom: 10
          }}
        >
          <i className="ti ti-fingerprint" style={{ fontSize: 36, color: '#d6f26b' }} aria-hidden></i>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 6 }}>
            {pending ? 'กำลังบันทึก...' : 'แตะเพื่อเช็คอิน'}
          </div>
          <div className="t-d-2" style={{ fontSize: 11 }}>ยืนยันด้วย GPS + อุปกรณ์ลงทะเบียน</div>
        </button>
      ) : !hasCheckedOut ? (
        <button
          onClick={() => handle('out')}
          disabled={pending || !coords}
          style={{
            border: 'none', width: '100%', textAlign: 'center',
            background: '#d6f26b', cursor: 'pointer', padding: 22, borderRadius: 24, color: '#0e0e10', marginBottom: 10
          }}
        >
          <i className="ti ti-logout-2" style={{ fontSize: 36 }} aria-hidden></i>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 6 }}>
            {pending ? 'กำลังบันทึก...' : 'แตะเพื่อเช็คเอาท์'}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>เช็คอินเมื่อ {todayCheckins.find((c) => c.type === 'in')?.ts.slice(11, 16)}</div>
        </button>
      ) : (
        <div className="card-dark" style={{ borderRadius: 24, textAlign: 'center', marginBottom: 10 }}>
          <i className="ti ti-circle-check-filled" style={{ fontSize: 36, color: '#d6f26b' }} aria-hidden></i>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>วันนี้ลงเวลาครบแล้ว</div>
          <div className="t-d-2" style={{ fontSize: 11 }}>เจอกันพรุ่งนี้ครับ 🌙</div>
        </div>
      )}

      {/* Off-site button */}
      <Link href="/offsite" style={{ textDecoration: 'none', display: 'block' }}>
        <div className="card-light" style={{ borderRadius: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: '#0e0e10',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <i className="ti ti-map-pin-plus" style={{ fontSize: 22, color: '#d6f26b' }} aria-hidden></i>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>ลานอกสถานที่</div>
            <div className="t-l-3" style={{ fontSize: 11 }}>ถ่ายรูป + GPS ยืนยันการลงทะเบียน</div>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#5c5c60' }} aria-hidden></i>
        </div>
      </Link>

      {/* History today */}
      {todayCheckins.length > 0 && (
        <div className="card-light" style={{ borderRadius: 18, marginTop: 10 }}>
          <div className="t-l-3" style={{ fontSize: 11, marginBottom: 6 }}>ประวัติวันนี้</div>
          {todayCheckins.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i > 0 ? '0.5px solid rgba(0,0,0,0.06)' : 'none', fontSize: 13 }}>
              <span><i className={c.type === 'in' ? 'ti ti-login-2' : 'ti ti-logout-2'} style={{ fontSize: 14, color: '#5c5c60' }} aria-hidden></i> {c.type === 'in' ? 'เช็คอิน' : 'เช็คเอาท์'}</span>
              <span style={{ fontWeight: 500 }}>{new Date(c.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, textAlign: 'center', fontSize: 10, color: '#5c5c60' }}>
        {empId} · 1 อุปกรณ์ = 1 พนักงาน
      </div>

      {/* Toast */}
      {toast && (
        <div onClick={() => setToast(null)} style={{
          position: 'fixed', bottom: 20, left: 20, right: 20, maxWidth: 380, margin: '0 auto',
          background: toast.kind === 'ok' ? '#d6f26b' : '#ff5b5b',
          color: toast.kind === 'ok' ? '#0e0e10' : '#fff',
          padding: 14, borderRadius: 14, textAlign: 'center', fontWeight: 600, fontSize: 14,
          boxShadow: '0 8px 20px rgba(0,0,0,0.15)', cursor: 'pointer', zIndex: 50
        }}>
          {toast.msg}
        </div>
      )}
    </main>
  );
}

function VerifyCard({ ok, warn, label, value, icon }: { ok: boolean; warn?: boolean; label: string; value: string; icon: string }) {
  const bg = ok ? 'rgba(157,225,203,0.4)' : warn ? 'rgba(250,199,117,0.35)' : 'rgba(255,180,180,0.35)';
  const border = ok ? 'rgba(29,158,117,0.4)' : warn ? 'rgba(186,117,23,0.4)' : 'rgba(200,50,50,0.3)';
  const textCol = ok ? '#0f6e56' : warn ? '#854f0b' : '#a32d2d';
  const textColMain = ok ? '#04342c' : warn ? '#412402' : '#501313';
  return (
    <div style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 14, padding: 10 }}>
      <div style={{ fontSize: 10, color: textCol }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, color: textColMain }}>
        <i className={`ti ti-${icon}`} style={{ fontSize: 12, marginRight: 4 }} aria-hidden></i>
        {value}
      </div>
    </div>
  );
}
