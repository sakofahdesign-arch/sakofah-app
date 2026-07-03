'use client';

import { useState, useTransition } from 'react';
import { login } from './actions';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await login(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card-dark" style={{ width: '100%', maxWidth: 380, borderRadius: 32, padding: 22 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12, background: 'var(--lime)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <i className="ti ti-moon-stars" style={{ fontSize: 20, color: '#0e0e10' }} aria-hidden></i>
          </div>
          <div>
            <div style={{ fontWeight: 600, lineHeight: 1, fontSize: 14 }}>Sakofah</div>
            <div className="t-d-3" style={{ fontSize: 11 }}>Islamic</div>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div className="accent" style={{ fontSize: 11, fontWeight: 500, marginBottom: 4 }}>
            ยินดีต้อนรับ · أهلا وسهلا
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3 }}>
            เข้าสู่ระบบ<br />ลงเวลาพนักงาน
          </div>
          <div className="t-d-2" style={{ fontSize: 12, marginTop: 6 }}>
            กรอกรหัสพนักงานและ PIN ที่ได้รับจากฝ่ายบุคคล
          </div>
        </div>

        <form action={handleSubmit}>
          <div style={{ marginBottom: 10 }}>
            <div className="t-d-3" style={{ fontSize: 11, marginBottom: 6 }}>รหัสพนักงาน</div>
            <div style={{ position: 'relative' }}>
              <i className="ti ti-id-badge-2"
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--lime)' }}
                aria-hidden></i>
              <input
                name="emp_id"
                placeholder="691415"
                required
                autoComplete="username"
                className="input-dark"
                style={{ paddingLeft: 38, textTransform: 'uppercase' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="t-d-3" style={{ fontSize: 11 }}>PIN / รหัสผ่าน</span>
              <span className="accent" style={{ fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
                ลืมรหัส?
              </span>
            </div>
            <div style={{ position: 'relative' }}>
              <i className="ti ti-lock"
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--lime)' }}
                aria-hidden></i>
              <input
                name="pin"
                type={showPin ? 'text' : 'password'}
                placeholder="••••••"
                required
                autoComplete="current-password"
                className="input-dark"
                style={{ paddingLeft: 38, paddingRight: 42 }}
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', color: 'var(--text-on-dark-3)', cursor: 'pointer'
                }}
                aria-label="แสดง/ซ่อน PIN"
              >
                <i className={showPin ? 'ti ti-eye-off' : 'ti ti-eye'} style={{ fontSize: 16 }} aria-hidden></i>
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(255,90,90,0.1)', border: '0.5px solid rgba(255,90,90,0.4)',
              color: '#ff8e8e', borderRadius: 12, padding: 10, fontSize: 12, marginBottom: 12
            }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 14, verticalAlign: -2, marginRight: 6 }} aria-hidden></i>
              {error}
            </div>
          )}

          <button type="submit" disabled={pending} className="btn-lime" style={{ marginBottom: 10 }}>
            {pending ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}{' '}
            {!pending && <i className="ti ti-arrow-right" style={{ fontSize: 14 }} aria-hidden></i>}
          </button>
        </form>

        <div className="t-d-3" style={{ fontSize: 10, textAlign: 'center', marginTop: 14 }}>
          v1.0 · ติดต่อผู้ดูแลระบบ: 073-xxx-xxx
        </div>
      </div>
    </main>
  );
}
