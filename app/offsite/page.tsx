'use client';

import { Suspense, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { submitOffsite } from './actions';
import { getOrCreateDeviceId } from '@/lib/device';
import { getDeviceAccessNotice, resolveDeviceAccess } from '@/lib/device-access';
import { checkinDialogMessage, checkinDialogTitle, formatTimingMs } from '@/lib/checkin-ui';
import { OFFSITE_PHOTO_QUALITY, fitImageDimensions } from '@/lib/offsite-photo';

// in-app browser (LINE, FB, IG ฯลฯ) มักบล็อก getUserMedia → ต้องใช้กล้องเนทีฟผ่าน file input
function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /\bLine\/|FBAN|FBAV|Instagram|Messenger|MicroMessenger|GSA\//i.test(ua);
}

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [boundDeviceId, setBoundDeviceId] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [location, setLocation] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [err, setErr] = useState<string | null>(null);
  const [camFallback, setCamFallback] = useState(false);
  const [successDialog, setSuccessDialog] = useState<{ type: 'offsite_in' | 'offsite_out'; timing: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function getBangkokDayRange(date = new Date()) {
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    return {
      start: new Date(`${ymd}T00:00:00.000+07:00`).toISOString(),
      end: new Date(`${ymd}T23:59:59.999+07:00`).toISOString(),
    };
  }

  // Auto-detect direction from today's checkins
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: emp } = await supabase.from('employees').select('emp_id, role, device_id').eq('id', user.id).single();
      if (!emp) return;
      setRole(emp.role);
      setBoundDeviceId(emp.device_id);
      const today = getBangkokDayRange();
      const { data: rows } = await supabase.from('checkins').select('type')
        .eq('emp_id', emp.emp_id)
        .gte('ts', today.start)
        .lte('ts', today.end);
      const types = (rows ?? []).map((r) => r.type);
      const hasIn = types.includes('in') || types.includes('offsite_in');
      setDirection(hasIn ? 'out' : 'in');
    })();
  }, []);

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  useEffect(() => {
    setNow(new Date());
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
    if (deviceBlocked) {
      setErr(deviceNotice?.message ?? 'กำลังตรวจสอบเครื่องที่ใช้งาน');
      return;
    }
    // LINE/in-app หรือเคยล้มเหลวมาแล้ว → เปิดกล้องเนทีฟตรงๆ แบบ sync (ต้องอยู่ใน user gesture)
    // สำคัญ: ห้ามเรียก .click() หลัง await เพราะจะเสีย user gesture แล้วบราวเซอร์บล็อก
    if (camFallback || isInAppBrowser() || !navigator.mediaDevices?.getUserMedia) {
      fileRef.current?.click();
      return;
    }
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
    } catch {
      // กล้องสดใช้ไม่ได้ → เปลี่ยนเป็นโหมดกล้องเนทีฟ (แตะอีกครั้ง = gesture ใหม่)
      setCamFallback(true);
      setErr('เปิดกล้องสดไม่ได้ — แตะปุ่มอีกครั้งเพื่อใช้กล้องของอุปกรณ์');
    }
  }

  function flipCamera() {
    const next = facing === 'environment' ? 'user' : 'environment';
    startCamera(next);
  }

  // วาดรูป + ลายน้ำ (GPS + เวลา) ลง canvas แล้วเก็บเป็น photo — ใช้ทั้งกล้องสดและไฟล์
  function renderWatermarked(source: CanvasImageSource, srcW: number, srcH: number, mirror: boolean) {
    if (!canvasRef.current || !coords || !now) {
      setErr('กรุณารอ GPS ตอบกลับก่อน');
      return;
    }
    const c = canvasRef.current;
    const { width: w, height: h } = fitImageDimensions(srcW, srcH);
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;

    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(source, 0, 0, w, h);
    if (mirror) ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Watermark (scale ลงตาม w)
    const topH = 44;
    ctx.fillStyle = 'rgba(214,242,107,0.95)';
    ctx.fillRect(0, 0, w, topH);
    ctx.fillStyle = '#0e0e10';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`SAKOFAH · ${direction === 'in' ? 'OFF-SITE IN' : 'OFF-SITE OUT'}`, 12, 28);

    const botH = 88;
    ctx.fillStyle = 'rgba(14,14,16,0.78)';
    ctx.fillRect(0, h - botH, w, botH);

    ctx.fillStyle = '#d6f26b';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('📍 พิกัด GPS', 12, h - botH + 22);

    ctx.fillStyle = '#ffffff';
    ctx.font = '15px sans-serif';
    ctx.fillText(`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`, 12, h - botH + 42);

    ctx.fillStyle = '#d6f26b';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('🕐', 12, h - botH + 68);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    const dateStr = now.toLocaleDateString('th-TH', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('th-TH');
    ctx.fillText(`${dateStr}  ·  ${timeStr}`, 38, h - botH + 70);

    c.toBlob((b) => {
      if (b) {
        setPhoto(b);
        setPhotoUrl(URL.createObjectURL(b));
      }
    }, 'image/jpeg', OFFSITE_PHOTO_QUALITY);
  }

  function takePhoto() {
    if (!videoRef.current) return;
    const v = videoRef.current;
    renderWatermarked(v, v.videoWidth, v.videoHeight, facing === 'user');
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }

  // เลือกรูปจากกล้องเนทีฟ (fallback) → ลายน้ำเหมือนกล้องสด
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // ให้เลือกไฟล์เดิมซ้ำได้
    if (!file) return;
    if (!coords || !now) { setErr('กรุณารอ GPS ตอบกลับก่อน'); return; }
    setErr(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      renderWatermarked(img, img.naturalWidth || 800, img.naturalHeight || 600, false);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { setErr('เปิดรูปไม่สำเร็จ ลองใหม่อีกครั้ง'); URL.revokeObjectURL(url); };
    img.src = url;
  }

  function retake() {
    setPhoto(null);
    setPhotoUrl(null);
    startCamera(facing);
  }

  function submit() {
    if (deviceBlocked) {
      setErr(deviceNotice?.message ?? 'กำลังตรวจสอบเครื่องที่ใช้งาน');
      return;
    }
    if (!photo || !coords || !location) {
      setErr('กรุณาถ่ายรูป + กรอกสถานที่ก่อน');
      return;
    }
    const fd = new FormData();
    fd.append('photo', photo, 'offsite.jpg');
    fd.append('lat', String(coords.lat));
    fd.append('lng', String(coords.lng));
    fd.append('location', location);
    fd.append('deviceId', getOrCreateDeviceId());

    const startedAt = performance.now();
    startTransition(async () => {
      const res = await submitOffsite(fd);
      if (res?.error === 'DEVICE_NOT_BOUND') router.replace('/account/device/bind');
      else if (res?.error === 'DEVICE_MISMATCH') router.replace('/account/device');
      else if (res?.error) setErr(res.error);
      else if (res.type) {
        setErr(null);
        setSuccessDialog({ type: res.type, timing: formatTimingMs(performance.now() - startedAt) });
        setTimeout(() => router.push('/checkin'), 650);
      }
    });
  }

  const dirColor = direction === 'in' ? '#d6f26b' : '#ff9d9d';
  const dirText = direction === 'in' ? '#0e0e10' : '#501313';
  const dirLabel = direction === 'in' ? 'Off-site IN' : 'Off-site OUT';
  const dirIcon = direction === 'in' ? 'arrow-big-up-line-filled' : 'arrow-big-down-line-filled';
  const nativeCapture = camFallback || isInAppBrowser() || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia;
  const deviceAccess = resolveDeviceAccess(role, boundDeviceId, deviceId);
  const deviceBlocked = deviceAccess.blocked;
  const deviceNotice = getDeviceAccessNotice(deviceAccess.status);
  const actionColor = deviceBlocked ? '#d6d3c8' : dirColor;
  const actionText = deviceBlocked ? '#5c5c60' : dirText;

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

      {deviceNotice && <DeviceAccessBanner notice={deviceNotice} />}

      {/* Camera */}
      <div style={{ borderRadius: 20, overflow: 'hidden', background: '#0e0e10', height: 320, position: 'relative', marginBottom: 12 }}>
        {!stream && !photoUrl && (
          <>
            <button onClick={() => startCamera()} disabled={deviceBlocked} style={{
              position: 'absolute', inset: 0, background: deviceBlocked ? '#d6d3c8' : '#0e0e10', color: deviceBlocked ? '#5c5c60' : '#fff', border: 'none', cursor: deviceBlocked ? 'not-allowed' : 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10
            }}>
              <i className={deviceBlocked ? 'ti ti-lock' : 'ti ti-camera'} style={{ fontSize: 44, color: deviceBlocked ? actionText : actionColor }} aria-hidden></i>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{deviceBlocked ? 'เครื่องนี้ยังไม่ได้รับอนุญาต' : 'แตะเพื่อเปิดกล้อง'}</span>
              <span style={{ fontSize: 11, color: '#c9c9cc' }}>
                {deviceBlocked ? 'กรุณาส่งคำขอเปลี่ยนเครื่องก่อน' : nativeCapture ? 'LINE จะเปิดกล้องของเครื่องโดยตรง' : 'ระบบจะขออนุญาตเข้าถึงกล้อง'}
              </span>
            </button>
            {nativeCapture && (
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFile}
                disabled={deviceBlocked}
                aria-label="เปิดกล้อง"
                style={{ position: 'absolute', inset: 0, opacity: 0.01, cursor: 'pointer' }}
              />
            )}
          </>
        )}
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: stream ? 'block' : 'none', transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
          playsInline muted
        />
        {photoUrl && <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          style={{ position: 'fixed', left: -9999, top: -9999, width: 1, height: 1, opacity: 0.01 }}
        />

        {stream && (
          <>
            <button onClick={flipCamera} aria-label="สลับกล้อง" style={{
              position: 'absolute', top: 10, right: 10, width: 38, height: 38, borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <i className="ti ti-camera-rotate" style={{ fontSize: 20 }} aria-hidden></i>
            </button>
            <button onClick={takePhoto} disabled={deviceBlocked} style={{
              position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
              width: 64, height: 64, borderRadius: '50%', background: actionColor,
              border: '4px solid #fff', cursor: deviceBlocked ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <i className="ti ti-camera" style={{ fontSize: 28, color: actionText }} aria-hidden></i>
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
          placeholder="เช่น ธนาคาร หรือกำลังเดินทาง"
          required
          style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 13, width: '100%', outline: 'none', marginTop: 2 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        <div style={{ background: '#1a1a1c', border: '0.5px solid #2a2a2d', borderRadius: 14, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#8e8e92' }}>วันที่</div>
          <div style={{ fontSize: 12, color: '#fff' }}>{now ? now.toLocaleDateString('th-TH') : '--/--/----'}</div>
        </div>
        <div style={{ background: '#1a1a1c', border: '0.5px solid #2a2a2d', borderRadius: 14, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#8e8e92' }}>เวลา</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#d6f26b' }}>{now ? now.toLocaleTimeString('th-TH') : '--:--:--'}</div>
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

      <button onClick={submit} disabled={pending || !photo || !coords || !location || deviceBlocked}
        style={{
          background: actionColor, color: actionText, border: 'none', borderRadius: 14,
          padding: 14, fontWeight: 700, fontSize: 14, width: '100%', cursor: deviceBlocked ? 'not-allowed' : 'pointer',
          opacity: (pending || !photo || !coords || !location || deviceBlocked) ? 0.5 : 1,
        }}
      >
        <i className={`ti ti-${dirIcon}`} style={{ fontSize: 16, marginRight: 6, verticalAlign: -3 }} aria-hidden></i>
        {deviceBlocked ? 'ไม่สามารถลงเวลาจากเครื่องนี้ได้' : pending ? 'กำลังส่ง...' : `ยืนยันส่ง Off-site ${direction === 'in' ? 'IN' : 'OUT'}`}
      </button>

      <div style={{ marginTop: 14, fontSize: 10, color: '#5c5c60', textAlign: 'center' }}>
        บันทึกอัตโนมัติ ไม่ต้องรอการอนุมัติ
      </div>
      {successDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 90, display: 'grid', placeItems: 'center', padding: 18 }}>
          <div style={{ width: '100%', maxWidth: 320, background: '#fff', borderRadius: 18, padding: 20, textAlign: 'center', boxShadow: '0 18px 40px rgba(0,0,0,0.25)' }}>
            <i className="ti ti-circle-check-filled" style={{ fontSize: 54, color: '#5dcaa5' }} aria-hidden></i>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>{checkinDialogTitle(successDialog.type)}</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{checkinDialogMessage()}</div>
            <div style={{ fontSize: 11, color: '#5c5c60', marginTop: 6 }}>{successDialog.timing}</div>
            <button type="button" onClick={() => router.push('/checkin')} style={{ marginTop: 16, width: '100%', border: 'none', borderRadius: 12, padding: 12, background: '#0e0e10', color: '#d6f26b', fontWeight: 800, cursor: 'pointer' }}>
              ตกลง
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function DeviceAccessBanner({ notice }: { notice: NonNullable<ReturnType<typeof getDeviceAccessNotice>> }) {
  return (
    <div style={{ background: '#fff0d9', border: '0.5px solid rgba(163,45,45,0.22)', borderRadius: 16, padding: 12, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: '#a32d2d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <i className="ti ti-device-mobile-x" style={{ fontSize: 18 }} aria-hidden></i>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0e0e10' }}>{notice.title}</div>
          <div style={{ fontSize: 11, color: '#6f2424', lineHeight: 1.45, marginTop: 2 }}>{notice.message}</div>
          <Link href={notice.actionHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, background: '#0e0e10', color: '#d6f26b', borderRadius: 10, padding: '7px 10px', fontSize: 11, fontWeight: 800, textDecoration: 'none' }}>
            <i className="ti ti-send" style={{ fontSize: 12 }} aria-hidden></i>
            {notice.actionLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
