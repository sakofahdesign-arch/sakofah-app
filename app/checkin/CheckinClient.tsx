'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { submitCheckin, signOut } from './actions';

type Props = {
  empName: string;
  empId: string;
  role: string;
  todayCheckins: { type: string; ts: string }[];
  settings: {
    office_lat: number; office_lng: number; radius_m: number;
    allowed_ssid: string; work_start: string; work_end: string;
    late_tolerance_min?: number; work_days?: string;
  } | null;
};

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const HOLD_DURATION = 2500; // 2.5 วินาที

export default function CheckinClient({ empName, empId, role, todayCheckins, settings }: Props) {
  const [now, setNow] = useState(new Date());
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [holding, setHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [sparkle, setSparkle] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const holdStart = useRef<number>(0);

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
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsError(null); },
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

  function playDing() {
    try {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start();
      o.stop(ctx.currentTime + 0.4);
    } catch {}
    try { navigator.vibrate?.([50, 30, 80]); } catch {}
  }

  function startHold(type: 'in' | 'out') {
    if (!coords) { setToast({ kind: 'err', msg: 'ยังหาตำแหน่ง GPS ไม่เจอ' }); return; }
    setHolding(true);
    setHoldProgress(0);
    holdStart.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - holdStart.current;
      const p = Math.min(1, elapsed / HOLD_DURATION);
      setHoldProgress(p);
      if (p >= 1) {
        completeHold(type);
        return;
      }
      holdTimer.current = requestAnimationFrame(tick);
    };
    holdTimer.current = requestAnimationFrame(tick);
  }

  function cancelHold() {
    if (holdTimer.current) cancelAnimationFrame(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
    setHoldProgress(0);
  }

  function completeHold(type: 'in' | 'out') {
    cancelHold();
    playDing();
    setSparkle(true);
    setTimeout(() => setSparkle(false), 800);
    startTransition(async () => {
      const res = await submitCheckin({ type, lat: coords!.lat, lng: coords!.lng });
      if (res?.error) setToast({ kind: 'err', msg: res.error });
      else setToast({ kind: 'ok', msg: type === 'in' ? 'เช็คอินสำเร็จ ✓' : 'เช็คเอาท์สำเร็จ ✓' });
    });
  }

  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const workDays = settings?.work_days === 'MTWTF' ? 'จ–ศ' : 'ทุกวัน';

  return (
    <main style={{ minHeight: '100vh', maxWidth: 420, margin: '0 auto', padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div className="t-l-3" style={{ fontSize: 11 }}>อัสสลามุอะลัยกุม</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{empName}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {role === 'admin' && (
            <Link href="/admin" style={{ background: '#0e0e10', color: '#d6f26b', textDecoration: 'none', border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-shield-check" style={{ fontSize: 12 }} aria-hidden></i>Admin
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" style={{ background: 'transparent', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
              <i className="ti ti-logout" style={{ fontSize: 12 }} aria-hidden></i> ออก
            </button>
          </form>
        </div>
      </div>

      <div className="card-lime" style={{ borderRadius: 24, marginBottom: 12 }}>
        <div className="t-l-2" style={{ fontSize: 11 }}>{dateStr}</div>
        <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: 1, lineHeight: 1 }}>{timeStr}</div>
        <div className="t-l-2" style={{ fontSize: 11, marginTop: 4 }}>
          เวลาทำการ {settings?.work_start?.slice(0, 5) ?? '08:20'} – {settings?.work_end?.slice(0, 5) ?? '16:30'} น. · {workDays}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <VerifyCard
          ok={!!coords && inRange}
          label="พิกัด GPS"
          value={gpsError ? 'ผิดพลาด' : !coords ? 'กำลังค้นหา...' : inRange ? `ในขอบเขต · ${Math.round(distance!)} ม.` : `นอกขอบเขต · ${Math.round(distance!)} ม.`}
          icon="map-pin-check"
        />
        <VerifyCard
          ok={hasCheckedIn && !hasCheckedOut}
          warn={!hasCheckedIn}
          label="สถานะวันนี้"
          value={hasCheckedOut ? 'เช็คเอาท์แล้ว' : hasCheckedIn ? 'อยู่ในเวลาทำงาน' : 'ยังไม่เช็คอิน'}
          icon="clock"
        />
      </div>

      {/* MAIN ACTION BUTTON — long-press */}
      {!hasCheckedIn ? (
        <HoldButton
          color="#7c5cff"
          arrow="up"
          label={holding ? 'กดค้างไว้...' : pending ? 'กำลังบันทึก...' : 'แตะค้างเพื่อเช็คอิน'}
          subLabel="กดค้าง 2.5 วินาทีเพื่อยืนยัน"
          progress={holdProgress}
          sparkle={sparkle}
          disabled={pending || !coords}
          onStart={() => startHold('in')}
          onCancel={cancelHold}
        />
      ) : !hasCheckedOut ? (
        <HoldButton
          color="#ff7a3d"
          arrow="down"
          label={holding ? 'กดค้างไว้...' : pending ? 'กำลังบันทึก...' : 'แตะค้างเพื่อเช็คเอาท์'}
          subLabel={`เช็คอินเมื่อ ${todayCheckins.find((c) => c.type === 'in')?.ts.slice(11, 16)}`}
          progress={holdProgress}
          sparkle={sparkle}
          disabled={pending || !coords}
          onStart={() => startHold('out')}
          onCancel={cancelHold}
        />
      ) : (
        <div className="card-dark" style={{ borderRadius: 24, textAlign: 'center', marginBottom: 10 }}>
          <i className="ti ti-circle-check-filled" style={{ fontSize: 36, color: '#d6f26b' }} aria-hidden></i>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>วันนี้ลงเวลาครบแล้ว</div>
          <div className="t-d-2" style={{ fontSize: 11 }}>เจอกันพรุ่งนี้ครับ 🌙</div>
        </div>
      )}

      <Link href="/offsite" style={{ textDecoration: 'none', display: 'block', marginTop: 10 }}>
        <div className="card-light" style={{ borderRadius: 18, display: 'flex', alignItems: 'center', gap: 12, background: '#fcdfb1' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#0e0e10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-map-pin-plus" style={{ fontSize: 22, color: '#d6f26b' }} aria-hidden></i>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>ลานอกสถานที่</div>
            <div style={{ fontSize: 11, color: '#5c4520' }}>ถ่ายรูป + GPS · {hasCheckedIn ? 'ออกนอกสถานที่' : 'เข้านอกสถานที่'}</div>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#5c4520' }} aria-hidden></i>
        </div>
      </Link>

      {todayCheckins.length > 0 && (
        <div style={{ background: '#e6e1f5', borderRadius: 18, padding: 14, marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#4b3d8c', marginBottom: 6 }}>ประวัติวันนี้</div>
          {todayCheckins.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i > 0 ? '0.5px solid rgba(75,61,140,0.15)' : 'none', fontSize: 13 }}>
              <span><i className={c.type === 'in' ? 'ti ti-login-2' : c.type === 'out' ? 'ti ti-logout-2' : 'ti ti-map-pin'} style={{ fontSize: 14, color: '#4b3d8c' }} aria-hidden></i> {c.type === 'in' ? 'เช็คอิน' : c.type === 'out' ? 'เช็คเอาท์' : c.type === 'offsite_in' ? 'นอกสถานที่ (เข้า)' : 'นอกสถานที่ (ออก)'}</span>
              <span style={{ fontWeight: 500 }}>{new Date(c.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, textAlign: 'center', fontSize: 10, color: '#5c5c60' }}>
        {empId} · 1 อุปกรณ์ = 1 พนักงาน
      </div>

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

function HoldButton({
  color, arrow, label, subLabel, progress, sparkle, disabled, onStart, onCancel,
}: {
  color: string; arrow: 'up' | 'down'; label: string; subLabel: string;
  progress: number; sparkle: boolean; disabled: boolean;
  onStart: () => void; onCancel: () => void;
}) {
  const ringSize = 110;
  const ringR = 50;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - progress);

  return (
    <div
      onPointerDown={(e) => { if (!disabled) { (e.target as Element).setPointerCapture?.(e.pointerId); onStart(); } }}
      onPointerUp={onCancel}
      onPointerCancel={onCancel}
      onPointerLeave={onCancel}
      style={{
        background: color, color: '#fff', borderRadius: 28, padding: '22px 16px',
        textAlign: 'center', userSelect: 'none', touchAction: 'none',
        opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', overflow: 'hidden',
        boxShadow: progress > 0.5 ? `0 0 ${30 + progress * 40}px ${color}88` : 'none',
        transition: 'box-shadow 0.1s',
      }}
    >
      <div style={{ position: 'relative', width: ringSize, height: ringSize, margin: '0 auto 8px' }}>
        <svg width={ringSize} height={ringSize} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
          <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
          <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none" stroke="#fff" strokeWidth="4"
            strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringOffset} style={{ transition: progress === 0 ? 'stroke-dashoffset 0.2s' : 'none' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className={`ti ti-arrow-big-${arrow}-line-filled`} style={{ fontSize: 44, color: '#fff' }} aria-hidden></i>
        </div>
        {sparkle && <div className="sparkle-burst" />}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11, opacity: 0.85 }}>{subLabel}</div>

      <style>{`
        .sparkle-burst {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(circle at center, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 60%);
          animation: sparkle-burst 0.8s ease-out forwards;
        }
        @keyframes sparkle-burst {
          0% { opacity: 1; transform: scale(0.3); }
          100% { opacity: 0; transform: scale(2.5); }
        }
      `}</style>
    </div>
  );
}

function VerifyCard({ ok, warn, label, value, icon }: { ok: boolean; warn?: boolean; label: string; value: string; icon: string }) {
  const bg = ok ? '#c5f1de' : warn ? '#fcdfb1' : '#fcc6c6';
  const textCol = ok ? '#0f6e56' : warn ? '#854f0b' : '#a32d2d';
  const textColMain = ok ? '#04342c' : warn ? '#412402' : '#501313';
  return (
    <div style={{ background: bg, borderRadius: 14, padding: 10 }}>
      <div style={{ fontSize: 10, color: textCol }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: textColMain }}>
        <i className={`ti ti-${icon}`} style={{ fontSize: 12, marginRight: 4 }} aria-hidden></i>{value}
      </div>
    </div>
  );
}
