'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiff } from '../../../LiffProvider';
import { bindLine, signOut } from './actions';

type Office = { lat: number; lng: number; radius_m: number; ssid: string | null } | null;

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const LIME = '#d6f26b';
const DARK = '#0e0e10';

export default function BindClient({ empId, branchName, office }: { empId: string; branchName: string; office: Office }) {
  const router = useRouter();
  const { profile, getIdToken } = useLiff();
  const [step, setStep] = useState<2 | 3>(2);
  const [err, setErr] = useState<{ msg: string; showChange?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [signingOut, setSigningOut] = useState(false);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsErr, setGpsErr] = useState(false);

  useEffect(() => {
    if (step !== 3 || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsErr(false); },
      () => setGpsErr(true),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [step]);

  const distance = coords && office ? distanceMeters(coords.lat, coords.lng, office.lat, office.lng) : null;
  const inRange = distance !== null && office ? distance <= office.radius_m : false;

  function confirmBind() {
    setErr(null);
    startTransition(async () => {
      const res = await bindLine(getIdToken());
      if (res.status === 'ok') { setStep(3); return; }
      if (res.status === 'taken') {
        setErr({ msg: 'บัญชี LINE นี้ถูกผูกกับพนักงานคนอื่นแล้ว — ผูกซ้ำไม่ได้', showChange: true });
      } else if (res.status === 'already_bound_other') {
        setErr({ msg: 'บัญชีพนักงานนี้ผูกกับ LINE อื่นไว้แล้ว หากต้องการเปลี่ยน กรุณาติดต่อผู้ดูแลระบบ', showChange: true });
      } else if (res.status === 'unverified') {
        setErr({ msg: 'ยืนยัน LINE ไม่สำเร็จ — โปรดเปิดผ่านแอป LINE อีกครั้ง' });
      } else if (res.status === 'no_emp') {
        setErr({ msg: 'เซสชันหมดอายุหรือไม่พบข้อมูลพนักงาน — โปรดเข้าสู่ระบบใหม่' });
      } else {
        setErr({ msg: res.message ?? 'ผูกบัญชี LINE ไม่สำเร็จ' });
      }
    });
  }

  function cancel() {
    setSigningOut(true);
    startTransition(async () => {
      await signOut();
      window.location.href = '/login';
    });
  }

  const Dots = ({ active }: { active: 2 | 3 }) => (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 18 }}>
      {[1, 2, 3].map((n) => (
        <div key={n} style={{
          width: n === active ? 22 : 7, height: 7, borderRadius: 999,
          background: n === active ? LIME : n < active ? '#4a5a1e' : '#2a2a2d',
          transition: 'all 0.2s',
        }} />
      ))}
    </div>
  );

  return (
    <main style={{ minHeight: '100vh', maxWidth: 420, margin: '0 auto', padding: 18, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, color: '#2e2e32' }}>
        {step === 3 ? (
          <button onClick={() => setStep(2)} style={{ background: 'transparent', border: 'none', color: '#2e2e32', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0 }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 18 }} aria-hidden></i>
          </button>
        ) : (
          <i className="ti ti-arrow-left" style={{ fontSize: 18, opacity: 0.3 }} aria-hidden></i>
        )}
        <span style={{ fontSize: 13, fontWeight: 500 }}>ขั้นตอนที่ {step} จาก 3</span>
      </div>

      {step === 2 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* LINE profile */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{ position: 'relative', width: 96, height: 96 }}>
              {profile?.pictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.pictureUrl} alt="" width={96} height={96}
                  style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '2px solid #2a2a2d' }} />
              ) : (
                <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#1a1a1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-user" style={{ fontSize: 44, color: '#5c5c60' }} aria-hidden></i>
                </div>
              )}
              <div style={{ position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: '50%', background: '#06c755', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #efeee9' }}>
                <i className="ti ti-brand-line" style={{ fontSize: 18, color: '#fff' }} aria-hidden></i>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>ยืนยันตัวตนด้วย LINE</div>
            <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5, color: '#5c5c60' }}>
              ผูกบัญชี LINE นี้เป็นตัวตนหลัก<br />ของรหัสพนักงาน {empId}
            </div>
          </div>

          {/* Info card */}
          <div style={{ background: DARK, borderRadius: 16, padding: 4, marginBottom: 12 }}>
            <InfoRow label="บัญชี LINE" value={profile?.displayName || '—'} last />
          </div>

          {/* Note */}
          <div style={{ background: '#e7f3bf', border: '1px solid #c2d97a', borderRadius: 14, padding: 12, display: 'flex', gap: 10, marginBottom: 14 }}>
            <i className="ti ti-info-circle" style={{ fontSize: 18, color: '#5c6b1e', marginTop: 1 }} aria-hidden></i>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: '#2e2e32' }}>
              <b style={{ color: '#0e0e10' }}>1 บัญชี LINE = 1 พนักงาน</b><br />
              เปลี่ยนบัญชีต้องให้ผู้ดูแลระบบอนุมัติก่อน เพื่อป้องกันการลงเวลาแทนกัน
            </div>
          </div>

          {err && (
            <div style={{ background: 'rgba(255,90,90,0.12)', border: '0.5px solid rgba(255,90,90,0.4)', color: '#c0392b', borderRadius: 12, padding: 10, fontSize: 12, marginBottom: 12 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 14, marginRight: 6, verticalAlign: -2 }} aria-hidden></i>
              {err.msg}
              {err.showChange && (
                <Link href="/account/device" style={{ display: 'block', marginTop: 8, color: '#5c6b1e', fontWeight: 600, textDecoration: 'none' }}>
                  แจ้งผู้ดูแลระบบ <i className="ti ti-arrow-right" style={{ fontSize: 12 }} aria-hidden></i>
                </Link>
              )}
            </div>
          )}

          <div style={{ marginTop: 'auto' }}>
            <button onClick={confirmBind} disabled={pending || !profile}
              style={{ width: '100%', background: LIME, color: DARK, border: 'none', borderRadius: 16, padding: 15, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: (pending || !profile) ? 0.5 : 1, marginBottom: 8 }}>
              <i className="ti ti-check" style={{ fontSize: 16, marginRight: 6, verticalAlign: -2 }} aria-hidden></i>
              {pending && !signingOut ? 'กำลังยืนยัน...' : 'ยืนยันบัญชี LINE นี้'}
            </button>
            <button onClick={cancel} disabled={pending}
              style={{ width: '100%', background: DARK, color: '#c9c9cc', border: 'none', borderRadius: 16, padding: 14, fontWeight: 500, fontSize: 14, cursor: 'pointer', opacity: pending ? 0.5 : 1 }}>
              {signingOut ? 'กำลังออก...' : 'ยกเลิก'}
            </button>
            <Dots active={2} />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>ตรวจสอบที่ตั้ง</div>
            <div style={{ fontSize: 12, marginTop: 4, color: '#5c5c60' }}>ระบบกำลังยืนยันว่าคุณอยู่ในออฟฟิศ</div>
          </div>

          {/* Map-ish card */}
          <div style={{ position: 'relative', height: 150, borderRadius: 18, overflow: 'hidden', background: '#17181c', border: '0.5px solid #2a2a2d', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.6)', color: LIME, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}>
              รัศมี {office?.radius_m ?? 80} ม.
            </div>
            <div style={{ position: 'relative', width: 110, height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px dashed ${inRange ? LIME : '#5c5c60'}`, opacity: 0.8 }} />
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: inRange ? LIME : '#e24b4a', boxShadow: `0 0 0 6px ${inRange ? 'rgba(214,242,107,0.2)' : 'rgba(226,75,74,0.2)'}` }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CheckRow icon="wifi" title="Wi-Fi" value={office?.ssid ?? 'ไม่ได้ตั้งค่า'} ok />
            <CheckRow
              icon="map-pin"
              title="พิกัด GPS"
              value={gpsErr ? 'เปิด GPS ไม่สำเร็จ' : !coords ? 'กำลังค้นหา...' : inRange ? `อยู่ในขอบเขต · ${Math.round(distance!)} ม. จากจุดกลาง` : `นอกขอบเขต · ${Math.round(distance!)} ม.`}
              ok={inRange}
              pendingState={!coords && !gpsErr}
            />
            <CheckRow icon="brand-line" title="บัญชี LINE" value={`${profile?.displayName ?? ''} · ผูกแล้ว`} ok />
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <button onClick={() => router.replace('/checkin')}
              style={{ width: '100%', background: LIME, color: DARK, border: 'none', borderRadius: 16, padding: 15, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              เข้าหน้าหลัก <i className="ti ti-arrow-right" style={{ fontSize: 16, marginLeft: 4, verticalAlign: -2 }} aria-hidden></i>
            </button>
            <Dots active={3} />
          </div>
        </div>
      )}
    </main>
  );
}

function InfoRow({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 12px', borderBottom: last ? 'none' : '0.5px solid #1e1e20' }}>
      <span style={{ fontSize: 12, color: '#8e8e92' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

function CheckRow({ icon, title, value, ok, pendingState }: { icon: string; title: string; value: string; ok?: boolean; pendingState?: boolean }) {
  const color = pendingState ? '#8e8e92' : ok ? LIME : '#ff9d9d';
  return (
    <div style={{ background: DARK, borderRadius: 14, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <i className={`ti ti-${icon}`} style={{ fontSize: 20, color }} aria-hidden></i>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#8e8e92' }}>{value}</div>
      </div>
      <i className={`ti ti-${pendingState ? 'loader-2' : ok ? 'circle-check-filled' : 'alert-circle'}`} style={{ fontSize: 18, color }} aria-hidden></i>
    </div>
  );
}
