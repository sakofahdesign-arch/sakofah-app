'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ChangePinPage() {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setErr(null);
    if (newPin.length < 6) { setErr('PIN ใหม่ต้องมีอย่างน้อย 6 หลัก'); return; }
    if (newPin !== confirmPin) { setErr('PIN ใหม่และยืนยันไม่ตรงกัน'); return; }

    startTransition(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { setErr('ไม่ได้เข้าสู่ระบบ'); return; }

      // verify old pin
      const { error: signinErr } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPin });
      if (signinErr) { setErr('PIN เดิมไม่ถูกต้อง'); return; }

      const { error } = await supabase.auth.updateUser({ password: newPin });
      if (error) { setErr(error.message); return; }

      setOk(true);
      setTimeout(() => router.push('/checkin'), 1500);
    });
  }

  return (
    <main style={{ minHeight: '100vh', maxWidth: 420, margin: '0 auto', padding: 18 }}>
      <Link href="/checkin" style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <i className="ti ti-arrow-left" style={{ fontSize: 18 }} aria-hidden></i>
        <span style={{ fontSize: 13 }}>กลับ</span>
      </Link>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#5c5c60' }}>ความปลอดภัย</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>เปลี่ยน PIN</div>
      </div>

      <div style={{ background: '#0e0e10', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="PIN เดิม" value={oldPin} onChange={setOldPin} />
        <Field label="PIN ใหม่ (≥6 หลัก)" value={newPin} onChange={setNewPin} />
        <Field label="ยืนยัน PIN ใหม่" value={confirmPin} onChange={setConfirmPin} />

        {err && (
          <div style={{ background: 'rgba(255,90,90,0.15)', color: '#ff9d9d', borderRadius: 12, padding: 10, fontSize: 12 }}>
            <i className="ti ti-alert-circle" style={{ fontSize: 13, marginRight: 4, verticalAlign: -2 }} aria-hidden></i>{err}
          </div>
        )}
        {ok && (
          <div style={{ background: 'rgba(214,242,107,0.15)', color: '#d6f26b', borderRadius: 12, padding: 10, fontSize: 12 }}>
            <i className="ti ti-check" style={{ fontSize: 13, marginRight: 4, verticalAlign: -2 }} aria-hidden></i>เปลี่ยน PIN สำเร็จ
          </div>
        )}

        <button onClick={submit} disabled={pending} style={{ background: '#d6f26b', color: '#0e0e10', border: 'none', borderRadius: 14, padding: 13, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 4, opacity: pending ? 0.5 : 1 }}>
          {pending ? 'กำลังบันทึก...' : 'ยืนยันเปลี่ยน PIN'}
        </button>
      </div>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8e8e92', marginBottom: 6 }}>{label}</div>
      <input
        type="password" inputMode="numeric"
        value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', background: '#1a1a1c', border: '0.5px solid #2a2a2d', color: '#fff', borderRadius: 12, padding: '12px 14px', fontSize: 14, outline: 'none' }}
      />
    </div>
  );
}
