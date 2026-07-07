'use client';

import liff from '@line/liff';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';

type LiffProfile = { userId: string; displayName: string; pictureUrl?: string };

type LiffState = {
  ready: boolean;
  inClient: boolean;
  profile: LiffProfile | null;
  getIdToken: () => string | null;
};

type LiffPhase = 'idle' | 'loading' | 'ready' | 'line-login' | 'error';

const LiffCtx = createContext<LiffState>({
  ready: false,
  inClient: false,
  profile: null,
  getIdToken: () => null,
});

export const useLiff = () => useContext(LiffCtx);

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;
const LIME = '#d6f26b';
const LIFF_INIT_TIMEOUT_MS = 12000;
const LIFF_PROFILE_TIMEOUT_MS = 8000;

// path ที่เปิดนอก LINE ได้ (admin ใช้ desktop, login สำหรับ admin)
function isExempt(pathname: string) {
  return pathname.startsWith('/admin') || pathname.startsWith('/login');
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export default function LiffProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<LiffPhase>(LIFF_ID && !isExempt(pathname) ? 'idle' : 'ready');
  const [inClient, setInClient] = useState(false);
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!LIFF_ID || isExempt(pathname)) return;

    let cancelled = false;

    (async () => {
      setPhase('loading');
      setInClient(false);
      setProfile(null);

      try {
        await withTimeout(
          liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: true }),
          LIFF_INIT_TIMEOUT_MS,
          'LIFF init',
        );
        if (cancelled) return;

        if (liff.isInClient()) {
          setInClient(true);

          if (!liff.isLoggedIn()) {
            setPhase('line-login');
            return;
          }

          const prof = await withTimeout(liff.getProfile(), LIFF_PROFILE_TIMEOUT_MS, 'LIFF profile');
          if (cancelled) return;

          setProfile({ userId: prof.userId, displayName: prof.displayName, pictureUrl: prof.pictureUrl });
        }

        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();

    return () => { cancelled = true; };
  }, [pathname, retryKey]);

  if (phase === 'loading') return <FullScreen title="กำลังเชื่อมต่อ LINE..." icon="loader-2" spin />;

  if (phase === 'line-login' && !isExempt(pathname)) {
    return (
      <FullScreen title="ยืนยันตัวตน LINE" icon="brand-line"
        sub="โปรดกดยืนยันหนึ่งครั้งเพื่อให้ LINE ส่ง token กลับมาที่ระบบ หากกดแล้วกลับมาหน้าเดิม ให้ปิดแท็บนี้แล้วเปิดผ่านลิงก์ LIFF ใหม่">
        <ActionRow>
          <button type="button" onClick={() => liff.login({ redirectUri: window.location.href })} style={buttonStyle}>
            ยืนยันผ่าน LINE
          </button>
          <a href={`https://liff.line.me/${LIFF_ID}`} style={linkButtonStyle}>
            เปิด LIFF ใหม่
          </a>
        </ActionRow>
      </FullScreen>
    );
  }

  if (phase === 'error' && !isExempt(pathname)) {
    return <FullScreen title="เชื่อมต่อ LINE ไม่สำเร็จ" icon="alert-triangle"
      sub="โปรดปิดแล้วเปิดใหม่ผ่านลิงก์ในแอป LINE อีกครั้ง หากยังไม่ได้ติดต่อผู้ดูแลระบบ">
      <ActionRow>
        <button type="button" onClick={() => setRetryKey((key) => key + 1)} style={buttonStyle}>
          ลองใหม่
        </button>
        <a href={`https://liff.line.me/${LIFF_ID}`} style={linkButtonStyle}>
          เปิดใน LINE
        </a>
      </ActionRow>
    </FullScreen>;
  }

  // บังคับเปิดผ่าน LINE เท่านั้น (ยกเว้นหน้า admin/login)
  if (LIFF_ID && phase !== 'ready' && !isExempt(pathname)) {
    return (
      <FullScreen title="กรุณาเปิดผ่านแอป LINE" icon="brand-line"
        sub="แอปนี้ใช้ได้เฉพาะภายในแอป LINE เท่านั้น เพื่อยืนยันตัวตนและป้องกันการลงเวลาแทนกัน">
        <a href={`https://liff.line.me/${LIFF_ID}`} style={linkButtonStyle}>
          เปิดใน LINE
        </a>
      </FullScreen>
    );
  }

  if (LIFF_ID && !inClient && !isExempt(pathname)) {
    return (
      <FullScreen title="กรุณาเปิดผ่านแอป LINE" icon="brand-line"
        sub="แอปนี้ใช้ได้เฉพาะภายในแอป LINE เท่านั้น เพื่อยืนยันตัวตนและป้องกันการลงเวลาแทนกัน">
        <a href={`https://liff.line.me/${LIFF_ID}`} style={linkButtonStyle}>
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

function ActionRow({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>{children}</div>;
}

const buttonBaseStyle = {
  color: '#0e0e10',
  borderRadius: 14,
  padding: '13px 22px',
  fontWeight: 700,
  fontSize: 14,
} satisfies CSSProperties;

const buttonStyle = {
  ...buttonBaseStyle,
  background: LIME,
  border: 0,
  cursor: 'pointer',
} satisfies CSSProperties;

const linkButtonStyle = {
  ...buttonBaseStyle,
  background: LIME,
  textDecoration: 'none',
} satisfies CSSProperties;
