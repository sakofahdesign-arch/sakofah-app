'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { submitCheckin, signOut } from './actions';
import { useLiff } from '../LiffProvider';

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

function timeToMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function tsToMin(ts: string): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

function lateMin(ts: string, workStart: string): number {
  return Math.max(0, tsToMin(ts) - timeToMin(workStart));
}

function earlyMin(ts: string, workEnd: string): number {
  return Math.max(0, timeToMin(workEnd) - tsToMin(ts));
}

const HOLD_DURATION = 1000; // 1 วินาที

export default function CheckinClient({ empName, empId, role, todayCheckins, settings }: Props) {
  const router = useRouter();
  const { getIdToken } = useLiff();
  const [now, setNow] = useState<Date | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [holdProgress, setHoldProgress] = useState(0);
  const [sparkle, setSparkle] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const holdStart = useRef<number>(0);

  useEffect(() => {
    setNow(new Date());
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
  const hasCheckedIn = types.includes('in') || types.includes('offsite_in');
  const hasCheckedOut = types.includes('out') || types.includes('offsite_out');

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
    setHoldProgress(0);
  }

  function completeHold(type: 'in' | 'out') {
    cancelHold();
    playDing();
    setSparkle(true);
    setTimeout(() => setSparkle(false), 800);
    startTransition(async () => {
      const res = await submitCheckin({ type, lat: coords!.lat, lng: coords!.lng, idToken: getIdToken() });
      if (res?.error === 'LINE_NOT_BOUND') {
        router.replace('/account/device/bind');
      } else if (res?.error === 'LINE_MISMATCH') {
        setToast({ kind: 'err', msg: 'บัญชี LINE ไม่ตรงกับที่ลงทะเบียน — เช็คอินแทนกันไม่ได้' });
      } else if (res?.error === 'LINE_UNVERIFIED') {
        setToast({ kind: 'err', msg: 'ยืนยัน LINE ไม่สำเร็จ — โปรดเปิดผ่านแอป LINE อีกครั้ง' });
      } else if (res?.error) {
        setToast({ kind: 'err', msg: res.error });
      } else {
        const ws = settings?.work_start ?? '08:20';
        const we = settings?.work_end ?? '16:30';
        const t = now ?? new Date();
        const nowMin = t.getHours() * 60 + t.getMinutes();
        let extra = '';
        if (type === 'in') {
          const late = Math.max(0, nowMin - timeToMin(ws));
          extra = late > 0 ? ` — เข้างานสาย ${late} นาที` : ' — ตรงเวลา 👍';
        } else {
          const early = Math.max(0, timeToMin(we) - nowMin);
          extra = early > 0 ? ` — เลิกก่อนเวลา ${early} นาที` : ' — ครบเวลา 👍';
        }
        setToast({ kind: 'ok', msg: (type === 'in' ? 'เช็คอินสำเร็จ ✓' : 'เช็คเอาท์สำเร็จ ✓') + extra });
      }
    });
  }

  const timeStr = now ? now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  const dateStr = now ? now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const workDays = settings?.work_days === 'MTWTF' ? 'จ–ศ' : 'ทุกวัน';

  // GPS chip styling — black bg with lime border (in range) or red border (out of range)
  const gpsBorder = !coords ? '#5c5c60' : inRange ? '#d6f26b' : '#e24b4a';
  const gpsTextColor = !coords ? '#c9c9cc' : inRange ? '#d6f26b' : '#ff7a7a';
  // Status chip — red if not checked in yet, peach-deep when in progress
  const statusColor = !hasCheckedIn ? '#e24b4a' : hasCheckedOut ? '#5c5c60' : '#d6f26b';

  return (
    <main className="no-select" style={{ minHeight: '100vh', maxWidth: 420, margin: '0 auto', padding: 18 }}>
      <style>{`
        .no-select, .no-select * {
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          -webkit-tap-highlight-color: transparent;
        }
        .no-select input { -webkit-user-select: text; user-select: text; }
        @keyframes sparkle-burst {
          0% { opacity: 1; transform: scale(0.3); }
          100% { opacity: 0; transform: scale(2.5); }
        }
        @keyframes float-up { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .menu-pop { animation: float-up 0.15s ease-out; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, position: 'relative' }}>
        <div>
          <div style={{ fontSize: 11, color: '#5c5c60' }}>อัสสลามุอะลัยกุม</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{empName}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {role === 'admin' && (
            <Link href="/admin" style={{ background: '#0e0e10', color: '#d6f26b', textDecoration: 'none', borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-shield-check" style={{ fontSize: 12 }} aria-hidden></i>Admin
            </Link>
          )}
          <button onClick={() => setMenuOpen((v) => !v)} style={{ width: 34, height: 34, borderRadius: '50%', background: '#0e0e10', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-dots-vertical" style={{ fontSize: 16 }} aria-hidden></i>
          </button>
        </div>

        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
            <div className="menu-pop" style={{ position: 'absolute', top: 44, right: 0, background: '#0e0e10', borderRadius: 14, padding: 6, minWidth: 200, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
              <MenuItem icon="key" label="เปลี่ยน PIN" href="/account/pin" />
              <MenuItem icon="device-mobile-cog" label="ขอเปลี่ยนเครื่อง" href="/account/device" />
              <div style={{ height: 1, background: '#2a2a2d', margin: '4px 6px' }} />
              <form action={signOut}>
                <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'transparent', border: 'none', color: '#ff7a7a', padding: '10px 12px', fontSize: 13, borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
                  <i className="ti ti-logout" style={{ fontSize: 16 }} aria-hidden></i>ออกจากระบบ
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Clock card */}
      <div style={{ background: '#d6f26b', color: '#0e0e10', borderRadius: 24, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#2e2e32' }}>{dateStr}</div>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: 1, lineHeight: 1 }}>{timeStr}</div>
        <div style={{ fontSize: 11, color: '#2e2e32', marginTop: 4 }}>
          เวลาทำงาน {(settings?.work_start?.slice(0, 5) ?? '08:20').replace(':', '.')} น. ถึง {(settings?.work_end?.slice(0, 5) ?? '16:30').replace(':', '.')} น.
        </div>
      </div>

      {/* Verify chips — dark bg with colored border */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div style={{ background: '#0e0e10', border: `1.5px solid ${gpsBorder}`, borderRadius: 14, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, color: '#8e8e92' }}>พิกัด GPS</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: gpsTextColor }}>
            <i className="ti ti-map-pin-check" style={{ fontSize: 12, marginRight: 4 }} aria-hidden></i>
            {gpsError ? 'ผิดพลาด' : !coords ? 'กำลังค้นหา...' : inRange ? `ในขอบเขต · ${Math.round(distance!)} ม.` : `นอกขอบเขต · ${Math.round(distance!)} ม.`}
          </div>
        </div>
        <div style={{ background: '#0e0e10', border: `1.5px solid ${statusColor}`, borderRadius: 14, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, color: '#8e8e92' }}>สถานะวันนี้</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: statusColor }}>
            <i className="ti ti-clock" style={{ fontSize: 12, marginRight: 4 }} aria-hidden></i>
            {hasCheckedOut ? 'เช็คเอาท์แล้ว' : hasCheckedIn ? 'อยู่ในเวลาทำงาน' : 'ยังไม่เช็คอิน'}
          </div>
        </div>
      </div>

      {/* MAIN ROUND ACTION BUTTON */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 18 }}>
        {!hasCheckedIn ? (
          <RoundHoldButton
            color="#d6f26b" textColor="#0e0e10" arrow="up" label="เช็คอิน"
            sub={pending ? 'กำลังบันทึก...' : 'กดค้าง 1 วินาที'}
            progress={holdProgress} sparkle={sparkle} disabled={pending || !coords}
            onStart={() => startHold('in')} onCancel={cancelHold}
          />
        ) : !hasCheckedOut ? (
          <RoundHoldButton
            color="#ff9d9d" textColor="#501313" arrow="down" label="เช็คเอาท์"
            sub={pending ? 'กำลังบันทึก...' : `เข้างานเมื่อ ${todayCheckins.find((c) => c.type === 'in' || c.type === 'offsite_in')?.ts.slice(11, 16)}`}
            progress={holdProgress} sparkle={sparkle} disabled={pending || !coords}
            onStart={() => startHold('out')} onCancel={cancelHold}
          />
        ) : (
          <div style={{ background: '#0e0e10', color: '#fff', borderRadius: 24, padding: 22, textAlign: 'center', width: '100%' }}>
            <i className="ti ti-circle-check-filled" style={{ fontSize: 40, color: '#d6f26b' }} aria-hidden></i>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>วันนี้ลงเวลาครบแล้ว</div>
            <div style={{ fontSize: 11, color: '#c9c9cc' }}>เจอกันพรุ่งนี้ครับ 🌙</div>
          </div>
        )}
      </div>

      {/* Off-site card — orange (enabled) or faded grey (disabled when day complete) */}
      {hasCheckedOut ? (
        <div style={{ background: '#d6d3c8', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, opacity: 0.65, cursor: 'not-allowed' }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-map-pin-off" style={{ fontSize: 24, color: '#0e0e10' }} aria-hidden></i>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0e0e10' }}>ลงเวลานอกสถานที่</div>
            <div style={{ fontSize: 11, color: '#0e0e10', opacity: 0.7 }}>วันนี้ลงเวลาครบแล้ว</div>
          </div>
          <i className="ti ti-lock" style={{ fontSize: 16, color: '#0e0e10', opacity: 0.5 }} aria-hidden></i>
        </div>
      ) : (
        <Link href="/offsite" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{ background: '#f5a85c', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-map-pin-plus" style={{ fontSize: 24, color: '#0e0e10' }} aria-hidden></i>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0e0e10' }}>ลงเวลานอกสถานที่</div>
              <div style={{ fontSize: 11, color: '#0e0e10', opacity: 0.75 }}>
                {hasCheckedIn ? 'ออกนอกสถานที่' : 'เข้านอกสถานที่'}
              </div>
            </div>
            <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#0e0e10' }} aria-hidden></i>
          </div>
        </Link>
      )}

      {/* History — dark card */}
      {todayCheckins.length > 0 && (
        <div style={{ background: '#0e0e10', borderRadius: 18, padding: 14, marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#8e8e92', marginBottom: 8 }}>ประวัติวันนี้</div>
          {todayCheckins.map((c, i) => {
            const isIn = c.type === 'in' || c.type === 'offsite_in';
            const iconColor = isIn ? '#d6f26b' : '#ff9d9d';
            const label = c.type === 'in' ? 'เช็คอิน' : c.type === 'out' ? 'เช็คเอาท์' : c.type === 'offsite_in' ? 'นอกสถานที่ (เข้า)' : 'นอกสถานที่ (ออก)';
            const ws = settings?.work_start ?? '08:20';
            const we = settings?.work_end ?? '16:30';
            const late = isIn ? lateMin(c.ts, ws) : 0;
            const early = !isIn ? earlyMin(c.ts, we) : 0;
            return (
              <div key={i} style={{ padding: '8px 0', borderTop: i > 0 ? '0.5px solid #2a2a2d' : 'none', fontSize: 13, color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <i className={isIn ? 'ti ti-login-2' : 'ti ti-logout-2'} style={{ fontSize: 16, color: iconColor }} aria-hidden></i>
                    {label}
                  </span>
                  <span style={{ fontWeight: 600, color: '#d6f26b' }}>{new Date(c.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {(late > 0 || early > 0) && (
                  <div style={{ marginTop: 4, marginLeft: 24, fontSize: 11, color: late > 0 ? '#ff9d9d' : '#fcdfb1' }}>
                    <i className={late > 0 ? 'ti ti-clock-exclamation' : 'ti ti-clock-pause'} style={{ fontSize: 12, marginRight: 4, verticalAlign: -2 }} aria-hidden></i>
                    {late > 0 ? `เข้างานสาย ${late} นาที` : `เลิกก่อนเวลา ${early} นาที`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 14, textAlign: 'center', fontSize: 10, color: '#5c5c60' }}>
        {empId} · 1 บัญชี LINE = 1 พนักงาน
      </div>

      {toast && (
        <div onClick={() => setToast(null)} style={{
          position: 'fixed', bottom: 20, left: 20, right: 20, maxWidth: 380, margin: '0 auto',
          background: toast.kind === 'ok' ? '#d6f26b' : '#e24b4a',
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

function MenuItem({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', color: '#fff', fontSize: 13, borderRadius: 10, textDecoration: 'none' }}>
      <i className={`ti ti-${icon}`} style={{ fontSize: 16, color: '#d6f26b' }} aria-hidden></i>{label}
    </Link>
  );
}

function RoundHoldButton({
  color, textColor, arrow, label, sub, progress, sparkle, disabled, onStart, onCancel,
}: {
  color: string; textColor: string; arrow: 'up' | 'down'; label: string; sub: string;
  progress: number; sparkle: boolean; disabled: boolean;
  onStart: () => void; onCancel: () => void;
}) {
  const size = 200;
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        onPointerDown={(e) => { if (!disabled) { (e.target as Element).setPointerCapture?.(e.pointerId); onStart(); } }}
        onPointerUp={onCancel}
        onPointerCancel={onCancel}
        onPointerLeave={onCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: 'relative', width: size, height: size, borderRadius: '50%',
          background: color, color: textColor,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          boxShadow: progress > 0.3 ? `0 0 ${20 + progress * 50}px ${color}aa` : '0 6px 18px rgba(0,0,0,0.15)',
          transition: 'box-shadow 0.1s',
          touchAction: 'none', userSelect: 'none',
        }}
      >
        {/* progress ring */}
        <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="6" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth="6"
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
            style={{ transition: progress === 0 ? 'stroke-dashoffset 0.2s' : 'none' }} />
        </svg>
        <i className={`ti ti-arrow-big-${arrow}-line-filled`} style={{ fontSize: 60, color: textColor }} aria-hidden></i>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{label}</div>
        {sparkle && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
            background: 'radial-gradient(circle at center, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 70%)',
            animation: 'sparkle-burst 0.8s ease-out forwards',
          }} />
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: '#5c5c60', textAlign: 'center' }}>{sub}</div>
    </div>
  );
}
