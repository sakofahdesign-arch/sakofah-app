'use client';

import { useEffect, useState, type ReactNode } from 'react';

function isAndroidLineBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android/i.test(ua) && /\bLine\//i.test(ua);
}

function chromeIntentUrl() {
  if (typeof window === 'undefined') return '#';
  const url = new URL(window.location.href);
  return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=https;package=com.android.chrome;end`;
}

export default function InAppBrowserGuard({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const [intentUrl, setIntentUrl] = useState('#');

  useEffect(() => {
    if (!isAndroidLineBrowser()) return;
    const timer = window.setTimeout(() => {
      setBlocked(true);
      setIntentUrl(chromeIntentUrl());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!blocked) return children;

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ maxWidth: 360 }}>
        <i className="ti ti-brand-chrome" style={{ fontSize: 58, color: '#d6f26b' }} aria-hidden></i>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 14 }}>เปิดด้วย Chrome</div>
        <div style={{ fontSize: 13, color: '#5c5c60', lineHeight: 1.6, marginTop: 8 }}>
          แอป LINE บน Android เปิดกล้องไม่เสถียร กรุณาเปิดเว็บนี้ใน Chrome ก่อนเข้าสู่ระบบและลงเวลา
        </div>
        <a
          href={intentUrl}
          style={{
            display: 'inline-flex',
            marginTop: 18,
            background: '#d6f26b',
            color: '#0e0e10',
            borderRadius: 14,
            padding: '13px 22px',
            fontWeight: 800,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          เปิดใน Chrome
        </a>
        <div style={{ fontSize: 11, color: '#8e8e92', lineHeight: 1.5, marginTop: 12 }}>
          ถ้าปุ่มไม่ทำงาน ให้กดเมนูมุมขวาบนของ LINE แล้วเลือกเปิดในเบราว์เซอร์ภายนอก
        </div>
      </div>
    </main>
  );
}
