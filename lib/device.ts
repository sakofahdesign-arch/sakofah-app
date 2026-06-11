'use client';

const KEY = 'sakofah_device_id';

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function getDeviceLabel(): string {
  if (typeof window === 'undefined') return '';
  const ua = navigator.userAgent;
  // Try to extract a friendly device name
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) {
    const m = ua.match(/Android[^;]*;\s*([^)]+)/);
    return m ? m[1].trim() : 'Android';
  }
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'อุปกรณ์';
}
