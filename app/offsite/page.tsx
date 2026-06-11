'use client';

import { Suspense, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getOrCreateDeviceId } from '@/lib/device';
import { submitOffsite } from './actions';

export default function OffsitePage() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>กำลังโหลด...</div>}>
      <OffsiteInner />
    </Suspense>
  );
}

function OffsiteInner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [now, setNow] = useState(new Date());
  const [location, setLocation] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Auto-detect direction from today's checkins
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: emp } = await supabase.from('employees').select('emp_id').eq('id', user.id).single();
      if (!emp) return;
      const today = new Date().toISOString().slice(0, 10);
      const { data: rows } = await supabase.from('checkins').select('type')
        .eq('emp_id', emp.emp_id)
        .gte('ts', `${today}T00:00:00`)
        .lte('ts', `${today}T23:59:59`);
      const types = (rows ?? []).map((r) => r.type);
      const hasIn = types.includes('in') || types.includes('offsite_in');
      setDirection(hasIn ? 'out' : 'in');
    })();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (e) => setErr('GPS ไม่ทำงาน: ' + e.message),
      { enableHighAccuracy: true }
    );
  }, []);

  async function startCamera(mode: 'environment' | 'user' = facing) {
    setErr(null);
    try {
      stream?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: false,
      });
      setStream(s);
      setFacing(mode);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
    } catch (e) {
      setErr('เปิดกล้องไม่สำเร็จ: ' + (e as Error).message);
    }
  }

  function flipCamera() {
    const next = facing === 'environment' ? 'user' : 'environment';
    startCamera(next);
  }

  function takePhoto() {
    if (!videoRef.current || !canvasRef.current || !coords) {
      setErr('กรุณารอ GPS ตอบกลับก่อน');
      return;
    }
    const v = videoRef.current;
    const c = canvasRef.current;
    const w = 1000;
    const h = Math.round((v.videoHeight / v.videoWidth) * w) || 750;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;

    if (facing === 'user') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, w, h);
    if (facing === 'user') ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Watermark
    const topH = 56;
    ctx.fillStyle = 'rgba(214,242,107,0.95)';
    ctx.fillRect(0, 0, w, topH);
    ctx.fillStyle = '#0e0e10';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`SAKOFAH · ${direction === 'in' ? 'OFF-SITE IN' : 'OFF-SITE OUT'}`, 16, 36);

    const botH = 110;
    ctx.fillStyle = 'rgba(14,14,16,0.78)';
    ctx.fillRect(0, h - botH, w, botH);

    ctx.fillStyle = '#d6f26b';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('📍 พิกัด GPS', 16, h - botH + 28);

    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`, 16, h - botH + 54);

    ctx.fillStyle = '#d6f26b';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('🕐', 16, h - botH + 86);

    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    const dateStr = now.toLocaleDateString('th-TH', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('th-TH');
    ctx.fillText(`${dateStr}  ·  ${timeStr}`, 48, h - botH + 88);

    c.toBlob((b) => {
      if (b) {
        setPhoto(b);
        setPhotoUrl(URL.createObjectURL(b));
        stream?.getTracks().forEach((t) => t.stop());
        setStream(null);
      }
    }, 'image/jpeg', 0.85);
  }

  function retake() {
    setPhoto(null);
    setPhotoUrl(null);
    startCamera(facing);
  }

  function submit() {
    if (!photo || !coords || !location) {
      setErr('กรุณาถ่ายรูป + กรอกสถานที่ก่อน');
      return;
    }
    const fd = new FormData();
    fd.append('photo', photo, 'offsite.jpg');
    fd.append('lat', String(coords.lat));
    fd.append('lng', String(coords.lng));
    fd.append('location', location);
    fd.append('device_id', getOrCreateDeviceId());

    startTransition(async () => {
      const res = await submitOffsite(fd);
      if (res?.error === 'DEVICE_MISMATCH') setErr('เครื่องนี้ไม่ตรงกับที่ลงทะเบียน — โปรดขอเปลี่ยนเครื่อง');
      else if (res?.error) setErr(res.error);
      else router.push('/checkin');
    });
  }

  const dirColor = direction === 'in' ? '#d6f26b' : '#ff9d9d';
  const dirText = direction === 'in' ? '#0e0e10' : '#501313';
  const dirLabel = direction === 'in' ? 'Off-site IN' : 'Off-site OUT';
  const dirIcon = direction === 'in' ? 'arrow-big-up-line-filled' : 'arrow-big-down-line-filled';

  return (
    <main style={{ minHeight: '100vh', maxWidth: 420, margin: '0 auto', padding: 18 }}>
      <Link href="/checkin" style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <i className="ti ti-arrow-left" style={{ fontSize: 18 }} aria-hidden></i>
        <span style={{ fontSize: 13 }}>กลับ</span>
      </Link>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#5c5c60' }}>โหมดลงเวลานอกสถานที่</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: dirColor === '#d6f26b' ? '#4a6b00' : '#a32d2d' }}>
          <i className={`ti ti-${dirIcon}`} style={{ fontSize: 22, verticalAlign: -3, marginRight: 6 }} aria-hidden></i>
          {dirLabel}
        </div>
      </div>

      {/* Camera */}
      <div style={{ borderRadius: 20, overflow: 'hidden', background: '#0e0e10', height: 320, position: 'relative', marginBottom: 12 }}>
        {!stream && !photoUrl && (
          <button onClick={() => startCamera()} style={{
            position: 'absolute', inset: 0, background: '#0e0e10', color: '#fff', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10
          }}>
            <i className="ti ti-camera" style={{ fontSize: 44, color: dirColor }} aria-hidden></i>
            <span style={{ fontSize: 14, fontWeight: 600 }}>แตะเพื่อเปิดกล้อง</span>
            <span style={{ fontSize: 11, color: '#c9c9cc' }}>ระบบจะขออนุญาตเข้าถึงกล้อง</span>
          </button>
        )}
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: stream ? 'block' : 'none', transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
          playsInline muted
        />
        {photoUrl && <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {stream && (
          <>
            <button onClick={flipCamera} aria-label="สลับกล้อง" style={{
              position: 'absolute', top: 10, right: 10, width: 38, height: 38, borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <i className="ti ti-camera-rotate" style={{ fontSize: 20 }} aria-hidden></i>
            </button>
            <button onClick={takePhoto} style={{
              position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
              width: 64, height: 64, borderRadius: '50%', background: dirColor,
              border: '4px solid #fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <i className="ti ti-camera" style={{ fontSize: 28, color: dirText }} aria-hidden></i>
            </button>
          </>
        )}
      </div>

      {photoUrl && (
        <button onClick={retake} style={{ background: 'transparent', border: '0.5px solid rgba(0,0,0,0.15)', color: '#0e0e10', borderRadius: 14, padding: 11, fontWeight: 500, fontSize: 13, width: '100%', cursor: 'pointer', marginBottom: 10 }}>
          <i className="ti ti-refresh" style={{ fontSize: 14, marginRight: 4 }} aria-hidden></i>ถ่ายใหม่
        </button>
      )}

      {/* Form */}
      <div style={{ background: '#1a1a1c', border: '0.5px solid #2a2a2d', borderRadius: 14, padding: '10px 12px', marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: '#8e8e92' }}>
          สถานที่ปฏิบัติงาน <span style={{ color: '#ff5b5b', fontWeight: 700 }}>*</span>
        </div>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="เช่น โรงเรียนบ้านตันหยง · ปัตตานี"
          required
          style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 13, width: '100%', outline: 'none', marginTop: 2 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        <div style={{ background: '#1a1a1c', border: '0.5px solid #2a2a2d', borderRadius: 14, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#8e8e92' }}>วันที่</div>
          <div style={{ fontSize: 12, color: '#fff' }}>{now.toLocaleDateString('th-TH')}</div>
        </div>
        <div style={{ background: '#1a1a1c', border: '0.5px solid #2a2a2d', borderRadius: 14, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#8e8e92' }}>เวลา</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#d6f26b' }}>{now.toLocaleTimeString('th-TH')}</div>
        </div>
      </div>

      <div style={{ background: '#1a1a1c', border: '0.5px solid #2a2a2d', borderRadius: 14, padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#8e8e92' }}>พิกัด GPS</div>
        <div style={{ fontSize: 12, color: '#fff' }}>
          {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'กำลังค้นหา...'}
        </div>
      </div>

      {err && (
        <div style={{ background: 'rgba(255,90,90,0.1)', color: '#a32d2d', borderRadius: 12, padding: 10, fontSize: 12, marginBottom: 10 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 14, marginRight: 6, verticalAlign: -2 }} aria-hidden></i>{err}
        </div>
      )}

      <button onClick={submit} disabled={pending || !photo || !coords || !location}
        style={{
          background: dirColor, color: dirText, border: 'none', borderRadius: 14,
          padding: 14, fontWeight: 700, fontSize: 14, width: '100%', cursor: 'pointer',
          opacity: (pending || !photo || !coords || !location) ? 0.5 : 1,
        }}
      >
        <i className={`ti ti-${dirIcon}`} style={{ fontSize: 16, marginRight: 6, verticalAlign: -3 }} aria-hidden></i>
        {pending ? 'กำลังส่ง...' : `ยืนยันส่ง Off-site ${direction === 'in' ? 'IN' : 'OUT'}`}
      </button>

      <div style={{ marginTop: 14, fontSize: 10, color: '#5c5c60', textAlign: 'center' }}>
        บันทึกอัตโนมัติ ไม่ต้องรอการอนุมัติ
      </div>
    </main>
  );
}
