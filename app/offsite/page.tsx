'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { submitOffsite } from './actions';

export default function OffsitePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [now, setNow] = useState(new Date());
  const [location, setLocation] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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

  async function startCamera() {
    setErr(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
    } catch (e) {
      setErr('เปิดกล้องไม่สำเร็จ: ' + (e as Error).message);
    }
  }

  function takePhoto() {
    if (!videoRef.current || !canvasRef.current || !coords) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    const w = 800;
    const h = (v.videoHeight / v.videoWidth) * w;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(v, 0, 0, w, h);

    // watermark
    const wmH = 70;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, h - wmH, w, wmH);
    ctx.fillStyle = '#d6f26b';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('SAKOFAH OFF-SITE', 12, h - 44);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`, 12, h - 22);
    ctx.fillText(now.toLocaleString('th-TH'), 12, h - 6);

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
    startCamera();
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

    startTransition(async () => {
      const res = await submitOffsite(fd);
      if (res?.error) setErr(res.error);
      else router.push('/checkin');
    });
  }

  return (
    <main style={{ minHeight: '100vh', maxWidth: 420, margin: '0 auto', padding: 18 }}>
      <Link href="/checkin" style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <i className="ti ti-arrow-left" style={{ fontSize: 18 }} aria-hidden></i>
        <span style={{ fontSize: 13 }}>กลับ</span>
      </Link>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#5c5c60' }}>โหมดลานอกสถานที่</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Off-site Check-in</div>
      </div>

      {/* Camera */}
      <div style={{ borderRadius: 20, overflow: 'hidden', background: '#0e0e10', height: 280, position: 'relative', marginBottom: 12 }}>
        {!stream && !photoUrl && (
          <button onClick={startCamera} style={{
            position: 'absolute', inset: 0, background: '#0e0e10', color: '#fff', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10
          }}>
            <i className="ti ti-camera" style={{ fontSize: 44, color: '#d6f26b' }} aria-hidden></i>
            <span style={{ fontSize: 14, fontWeight: 600 }}>แตะเพื่อเปิดกล้อง</span>
            <span style={{ fontSize: 11, color: '#c9c9cc' }}>ระบบจะขออนุญาตเข้าถึงกล้อง</span>
          </button>
        )}
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: stream ? 'block' : 'none' }} playsInline muted />
        {photoUrl && <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {stream && (
          <button onClick={takePhoto} style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            width: 60, height: 60, borderRadius: '50%', background: '#d6f26b',
            border: '4px solid #fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <i className="ti ti-camera" style={{ fontSize: 26, color: '#0e0e10' }} aria-hidden></i>
          </button>
        )}
      </div>

      {photoUrl && (
        <button onClick={retake} className="btn-ghost" style={{ marginBottom: 10, color: '#0e0e10', borderColor: 'rgba(0,0,0,0.15)' }}>
          <i className="ti ti-refresh" style={{ fontSize: 14 }} aria-hidden></i> ถ่ายใหม่
        </button>
      )}

      {/* Form */}
      <div className="pill-dark" style={{ marginBottom: 6 }}>
        <div className="t-d-3" style={{ fontSize: 11 }}>สถานที่ปฏิบัติงาน</div>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="เช่น โรงเรียนบ้านตันหยง · ปัตตานี"
          style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 13, width: '100%', outline: 'none', marginTop: 2 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        <div className="pill-dark">
          <div className="t-d-3" style={{ fontSize: 11 }}>วันที่</div>
          <div style={{ fontSize: 12, color: '#fff' }}>{now.toLocaleDateString('th-TH')}</div>
        </div>
        <div className="pill-dark">
          <div className="t-d-3" style={{ fontSize: 11 }}>เวลา</div>
          <div className="accent" style={{ fontSize: 12, fontWeight: 600 }}>{now.toLocaleTimeString('th-TH')}</div>
        </div>
      </div>

      <div className="pill-dark" style={{ marginBottom: 12 }}>
        <div className="t-d-3" style={{ fontSize: 11 }}>พิกัด GPS</div>
        <div style={{ fontSize: 12, color: '#fff' }}>
          {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'กำลังค้นหา...'}
        </div>
      </div>

      {err && (
        <div style={{ background: 'rgba(255,90,90,0.1)', color: '#a32d2d', borderRadius: 12, padding: 10, fontSize: 12, marginBottom: 10 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 14, verticalAlign: -2, marginRight: 6 }} aria-hidden></i>
          {err}
        </div>
      )}

      <button onClick={submit} disabled={pending || !photo || !coords || !location} className="btn-lime">
        <i className="ti ti-send" style={{ fontSize: 14 }} aria-hidden></i> {pending ? 'กำลังส่ง...' : 'ยืนยันส่งเช็คอินนอกสถานที่'}
      </button>

      <div style={{ marginTop: 14, fontSize: 10, color: '#5c5c60', textAlign: 'center' }}>
        คำขอจะส่งให้ HR อนุมัติก่อนนับเป็นเวลาทำงาน
      </div>
    </main>
  );
}
