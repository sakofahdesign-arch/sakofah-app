'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function DeviceRequestPage() {
  const [reason, setReason] = useState('');
  const [newDevice, setNewDevice] = useState(typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : '');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setErr(null);
    if (!reason.trim()) { setErr('กรุณากรอกเหตุผล'); return; }

    startTransition(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErr('ไม่ได้เข้าสู่ระบบ'); return; }
      const { data: emp } = await supabase.from('employees').select('emp_id, device_id').eq('id', user.id).single();
      if (!emp) { setErr('ไม่พบข้อมูลพนักงาน'); return; }

      const { error } = await supabase.from('device_requests').insert({
        emp_id: emp.emp_id,
        old_device: emp.device_id,
        new_device: newDevice,
        reason,
        status: 'pending',
      });
      if (error) { setErr(error.message); return; }
      setOk(true);
    });
  }

  return (
    <main style={{ minHeight: '100vh', maxWidth: 420, margin: '0 auto', padding: 18 }}>
      <Link href="/checkin" style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <i className="ti ti-arrow-left" style={{ fontSize: 18 }} aria-hidden></i>
        <span style={{ fontSize: 13 }}>กลับ</span>
      </Link>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#5c5c60' }}>อุปกรณ์</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>ขอเปลี่ยนเครื่องผูกใหม่</div>
      </div>

      {ok ? (
        <div style={{ background: '#d6f26b', color: '#0e0e10', borderRadius: 18, padding: 20, textAlign: 'center' }}>
          <i className="ti ti-circle-check-filled" style={{ fontSize: 40 }} aria-hidden></i>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>ส่งคำขอเรียบร้อย</div>
          <div style={{ fontSize: 12, marginTop: 2 }}>HR จะติดต่อกลับภายใน 24 ชม.</div>
          <Link href="/checkin" style={{ display: 'inline-block', marginTop: 12, background: '#0e0e10', color: '#d6f26b', borderRadius: 10, padding: '8px 16px', fontSize: 12, textDecoration: 'none', fontWeight: 600 }}>กลับหน้าหลัก</Link>
        </div>
      ) : (
        <div style={{ background: '#0e0e10', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#8e8e92', marginBottom: 6 }}>เครื่องใหม่ (อุปกรณ์ที่ใช้อยู่นี้)</div>
            <textarea value={newDevice} onChange={(e) => setNewDevice(e.target.value)} rows={2}
              style={{ width: '100%', background: '#1a1a1c', border: '0.5px solid #2a2a2d', color: '#fff', borderRadius: 12, padding: '10px 12px', fontSize: 12, outline: 'none', resize: 'none' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8e8e92', marginBottom: 6 }}>
              เหตุผล <span style={{ color: '#ff5b5b' }}>*</span>
            </div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              placeholder="เช่น เครื่องเก่าจอแตก / เปลี่ยนเครื่องใหม่"
              style={{ width: '100%', background: '#1a1a1c', border: '0.5px solid #2a2a2d', color: '#fff', borderRadius: 12, padding: '10px 12px', fontSize: 13, outline: 'none', resize: 'none' }} />
          </div>

          {err && (
            <div style={{ background: 'rgba(255,90,90,0.15)', color: '#ff9d9d', borderRadius: 12, padding: 10, fontSize: 12 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 13, marginRight: 4, verticalAlign: -2 }} aria-hidden></i>{err}
            </div>
          )}

          <button onClick={submit} disabled={pending} style={{ background: '#d6f26b', color: '#0e0e10', border: 'none', borderRadius: 14, padding: 13, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 4, opacity: pending ? 0.5 : 1 }}>
            <i className="ti ti-send" style={{ fontSize: 14, marginRight: 4 }} aria-hidden></i>{pending ? 'กำลังส่ง...' : 'ส่งคำขอให้ HR'}
          </button>

          <div style={{ fontSize: 10, color: '#8e8e92', textAlign: 'center' }}>
            HR ตรวจสอบภายใน 24 ชม. · เครื่องเก่าจะถูกยกเลิกเมื่ออนุมัติ
          </div>
        </div>
      )}
    </main>
  );
}
