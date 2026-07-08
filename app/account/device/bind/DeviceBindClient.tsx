'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getDeviceInfo, getOrCreateDeviceId } from '@/lib/device';
import { bindDevice } from './actions';

type PermissionState = 'idle' | 'ok' | 'error';

const LIME = '#d6f26b';
const DARK = '#0e0e10';

function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /\bLine\/|FBAN|FBAV|Instagram|Messenger|MicroMessenger|GSA\//i.test(ua);
}

export default function DeviceBindClient({
  empId,
  empName,
  boundDeviceId,
}: {
  empId: string;
  empName: string;
  boundDeviceId: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [deviceId, setDeviceId] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [gps, setGps] = useState<PermissionState>('idle');
  const [camera, setCamera] = useState<PermissionState>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const info = getDeviceInfo();
    setDeviceId(getOrCreateDeviceId());
    setDeviceLabel([info.label, info.model, info.os].filter(Boolean).join(' · '));
  }, []);

  useEffect(() => {
    if (!boundDeviceId || !deviceId) return;
    if (boundDeviceId === deviceId) router.replace('/checkin');
  }, [boundDeviceId, deviceId, router]);

  function requestGps() {
    setErr(null);
    if (!navigator.geolocation) {
      setGps('error');
      setErr('เบราว์เซอร์นี้ไม่รองรับตำแหน่ง');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setGps('ok'),
      (error) => {
        setGps('error');
        setErr(error.message || 'เปิดตำแหน่งไม่สำเร็จ');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function requestCamera() {
    setErr(null);
    if (isInAppBrowser()) {
      setCamera('ok');
      fileRef.current?.click();
      return;
    }
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        stream.getTracks().forEach((track) => track.stop());
        setCamera('ok');
        return;
      } catch {
        // LINE Android often blocks live camera. Fall through to native capture.
      }
    }
    fileRef.current?.click();
  }

  function onCameraFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      setCamera('ok');
      return;
    }
    setCamera('error');
  }

  function confirmBind() {
    if (submitting || pending) return;
    setErr(null);
    if (gps !== 'ok') {
      setErr('กรุณาอนุญาตตำแหน่งก่อน');
      return;
    }
    if (camera !== 'ok') {
      setErr('กรุณาอนุญาตกล้องก่อน');
      return;
    }
    setSubmitting(true);
    startTransition(async () => {
      const res = await bindDevice(deviceId);
      if (res.status === 'ok') {
        router.replace('/checkin');
        return;
      }
      if (res.status === 'taken') {
        setErr('เครื่องนี้ถูกผูกกับพนักงานคนอื่นแล้ว');
      } else if (res.status === 'already_bound_other') {
        setErr('บัญชีนี้ผูกกับเครื่องอื่นไว้แล้ว หากต้องการเปลี่ยน กรุณาขอเปลี่ยนเครื่อง');
      } else {
        setErr(res.message ?? 'ผูกเครื่องไม่สำเร็จ');
      }
      setSubmitting(false);
    });
  }

  const mismatch = Boolean(boundDeviceId && deviceId && boundDeviceId !== deviceId);
  const nativeCamera = typeof navigator !== 'undefined' && (isInAppBrowser() || !navigator.mediaDevices?.getUserMedia);
  const submitLocked = submitting || pending;

  function cancel() {
    if (submitLocked) return;
    router.replace('/logout');
  }

  return (
    <main style={{ minHeight: '100vh', maxWidth: 420, margin: '0 auto', padding: 18, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, color: '#2e2e32' }}>
        <i className="ti ti-arrow-left" style={{ fontSize: 18, opacity: 0.3 }} aria-hidden></i>
        <span style={{ fontSize: 13, fontWeight: 500 }}>ขั้นตอนที่ 2 จาก 3</span>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>ยืนยันเครื่องนี้</div>
        <div style={{ fontSize: 12, color: '#5c5c60', lineHeight: 1.5, marginTop: 4 }}>
          ระบบจะให้ลงเวลาได้เฉพาะเครื่องที่ผูกไว้ เพื่อป้องกันการลงเวลาแทนกัน
        </div>
      </div>

      <div style={{ background: DARK, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: '#1a1a1c', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#8e8e92', marginBottom: 4 }}>ผู้ใช้งาน</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>
            <i className="ti ti-user-check" style={{ color: LIME, marginRight: 6 }} aria-hidden></i>
            {empName}
          </div>
          <div style={{ fontSize: 11, color: '#c9c9cc', marginTop: 5 }}>รหัสพนักงาน {empId}</div>
        </div>

        <div style={{ background: '#1a1a1c', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#8e8e92', marginBottom: 4 }}>เครื่องที่กำลังใช้</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
            <i className="ti ti-device-mobile" style={{ color: LIME, marginRight: 6 }} aria-hidden></i>
            {deviceLabel || 'กำลังอ่านข้อมูลเครื่อง...'}
          </div>
          <div style={{ fontSize: 10, color: '#5c5c60', fontFamily: 'monospace', marginTop: 5 }}>{deviceId ? `${deviceId.slice(0, 13)}...` : ''}</div>
        </div>

        {mismatch ? (
          <div style={{ background: 'rgba(255,90,90,0.15)', color: '#ff9d9d', borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 1.5 }}>
            บัญชีนี้ผูกกับเครื่องอื่นไว้แล้ว กรุณาไปที่เมนู “ขอเปลี่ยนเครื่อง”
          </div>
        ) : (
          <>
            <PermissionRow icon="map-pin" title="ตำแหน่ง" status={gps} onClick={requestGps} />
            {nativeCamera ? (
              <PermissionFileRow icon="camera" title="กล้อง" status={camera} onChange={onCameraFile} onOpen={() => setCamera('ok')} />
            ) : (
              <PermissionRow icon="camera" title="กล้อง" status={camera} onClick={requestCamera} />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*;capture=camera"
              capture="environment"
              onChange={onCameraFile}
              style={{ position: 'fixed', left: -9999, top: -9999, width: 1, height: 1, opacity: 0.01 }}
            />
          </>
        )}

        {err && (
          <div style={{ background: 'rgba(255,90,90,0.15)', color: '#ff9d9d', borderRadius: 12, padding: 10, fontSize: 12 }}>
            <i className="ti ti-alert-circle" style={{ fontSize: 13, marginRight: 4, verticalAlign: -2 }} aria-hidden></i>{err}
          </div>
        )}

        <button
          onClick={confirmBind}
          disabled={submitLocked || mismatch || !deviceId}
          style={{ background: LIME, color: DARK, border: 'none', borderRadius: 14, padding: 14, fontWeight: 800, fontSize: 14, cursor: (submitLocked || mismatch || !deviceId) ? 'not-allowed' : 'pointer', opacity: (submitLocked || mismatch || !deviceId) ? 0.45 : 1 }}
        >
          {submitLocked ? 'กำลังผูกเครื่อง...' : 'ยืนยันผูกเครื่องนี้'}
        </button>
        <button
          onClick={cancel}
          disabled={submitLocked}
          style={{ background: 'transparent', color: '#c9c9cc', border: '1px solid #2a2a2d', borderRadius: 14, padding: 12, fontWeight: 700, fontSize: 13, cursor: submitLocked ? 'not-allowed' : 'pointer', opacity: submitLocked ? 0.45 : 1 }}
        >
          ยกเลิก
        </button>
      </div>
    </main>
  );
}

function PermissionRow({ icon, title, status, onClick }: { icon: string; title: string; status: PermissionState; onClick: () => void }) {
  const color = status === 'ok' ? LIME : status === 'error' ? '#ff9d9d' : '#c9c9cc';
  const text = status === 'ok' ? 'อนุญาตแล้ว' : status === 'error' ? 'ไม่สำเร็จ' : 'แตะเพื่ออนุญาต';

  return (
    <button onClick={onClick} type="button" style={{ background: '#1a1a1c', border: 'none', borderRadius: 14, padding: '12px 14px', color: '#fff', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer' }}>
      <i className={`ti ti-${icon}`} style={{ fontSize: 22, color }} aria-hidden></i>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 11, color }}>{text}</div>
      </div>
      <i className={`ti ti-${status === 'ok' ? 'circle-check-filled' : 'chevron-right'}`} style={{ fontSize: 18, color }} aria-hidden></i>
    </button>
  );
}

function PermissionFileRow({ icon, title, status, onChange, onOpen }: { icon: string; title: string; status: PermissionState; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onOpen: () => void }) {
  const color = status === 'ok' ? LIME : status === 'error' ? '#ff9d9d' : '#c9c9cc';
  const text = status === 'ok' ? 'อนุญาตแล้ว' : status === 'error' ? 'ไม่สำเร็จ' : 'แตะเพื่ออนุญาต';

  return (
    <label onPointerDown={onOpen} style={{ position: 'relative', background: '#1a1a1c', borderRadius: 14, padding: '12px 14px', color: '#fff', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', overflow: 'hidden' }}>
      <i className={`ti ti-${icon}`} style={{ fontSize: 22, color }} aria-hidden></i>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 11, color }}>{text}</div>
      </div>
      <i className={`ti ti-${status === 'ok' ? 'circle-check-filled' : 'chevron-right'}`} style={{ fontSize: 18, color }} aria-hidden></i>
      <input
        type="file"
        accept="image/*;capture=camera"
        capture="environment"
        onChange={onChange}
        aria-label={title}
        style={{ position: 'absolute', inset: 0, opacity: 0.01, cursor: 'pointer' }}
      />
    </label>
  );
}
