'use client';

import liff from '@line/liff';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type LiffProfile = { userId: string; displayName: string; pictureUrl?: string };

type LiffState = {
  ready: boolean;
  inClient: boolean;
  profile: LiffProfile | null;
  getIdToken: () => string | null;
};

const LiffCtx = createContext<LiffState>({
  ready: false,
  inClient: false,
  profile: null,
  getIdToken: () => null,
});

export const useLiff = () => useContext(LiffCtx);

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;
const LIME = '#d6f26b';

// path ที่เปิดนอก LINE ได้ (admin ใช้ desktop, login สำหรับ admin)
function isExempt(pathname: string) {
  return pathname.startsWith('/admin') || pathname.startsWith('/login');
}

export default function LiffProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>(LIFF_ID ? 'loading' : 'ready');
  const [inClient, setInClient] = useState(false);
  const [debugError, setDebugError] = useState<string>(''); // เพิ่มบรรทัดนี้
  const [profile, setProfile] = useState<LiffProfile | null>(null);

  useEffect(() => {
    if (!LIFF_ID) return; // ไม่ได้ตั้งค่า (local/build) → ข้าม gate
    let cancelled = false;
    (async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (cancelled) return;
        if (liff.isInClient()) {
          if (!liff.isLoggedIn()) { liff.login(); return; } // reload กลับมาเอง
          const prof = await liff.getProfile();
          if (cancelled) return;
          setProfile({ userId: prof.userId, displayName: prof.displayName, pictureUrl: prof.pictureUrl });
          setInClient(true);
        }
        setPhase('ready');
      } catch (err) {
        if (!cancelled) {
          setDebugError(err instanceof Error ? err.message : String(err));
          setPhase('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (phase === 'loading') return <FullScreen title="กำลังเชื่อมต่อ LINE..." icon="loader-2" spin />;

  if (phase === 'error' && !isExempt(pathname)) {
    return <FullScreen title="เชื่อมต่อ LINE ไม่สำเร็จ" icon="alert-triangle"
      sub={`DEBUG: ${debugError}`} />;
  }

  // บังคับเปิดผ่าน LINE เท่านั้น (ยกเว้นหน้า admin/login)
  if (LIFF_ID && !inClient && !isExempt(pathname)) {
    return (
      <FullScreen title="กรุณาเปิดผ่านแอป LINE" icon="brand-line"
        sub="แอปนี้ใช้ได้เฉพาะภายในแอป LINE เท่านั้น เพื่อยืนยันตัวตนและป้องกันการลงเวลาแทนกัน">
        <a href={`https://liff.line.me/${LIFF_ID}`}
          style={{ marginTop: 18, background: LIME, color: '#0e0e10', borderRadius: 14, padding: '13px 22px', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          เปิดใน LINE
        </a>
      </FullScreen>
    );
  }

  return (
    <LiffCtx.Provider value={{ ready: true, inClient, profile, getIdToken: () => (inClient ? liff.getIDToken() : null) }}>
      {children}
    </LiffCtx.Provider>
  );
}

function FullScreen({ title, sub, icon, spin, children }: {
  title: string; sub?: string; icon: string; spin?: boolean; children?: ReactNode;
}) {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 28 }}>
      <style>{`@keyframes liff-spin { to { transform: rotate(360deg); } }`}</style>
      <i className={`ti ti-${icon}`} style={{ fontSize: 52, color: LIME, animation: spin ? 'liff-spin 0.9s linear infinite' : undefined }} aria-hidden></i>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 16 }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: '#5c5c60', marginTop: 8, maxWidth: 300, lineHeight: 1.5 }}>{sub}</div>}
      {children}
    </main>
  );
}
