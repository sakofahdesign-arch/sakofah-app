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

export type DeviceInfo = { label: string; model: string; os: string };

// best-effort parse รุ่น + OS จาก user agent (สำหรับหน้าผูกอุปกรณ์)
export function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') return { label: '', model: '', os: '' };
  const ua = navigator.userAgent;
  const label = getDeviceLabel();

  // iOS: "OS 17_5" → "iOS 17"
  if (/iPhone|iPad|iPod/.test(ua)) {
    const m = ua.match(/OS (\d+)[_.]?(\d+)?/);
    const os = m ? `iOS ${m[1]}` : 'iOS';
    return { label, model: label, os };
  }

  // Android: "Android 14; SM-A546E Build/..." → model = SM-A546E, os = Android 14
  if (/Android/.test(ua)) {
    const verMatch = ua.match(/Android\s+([\d.]+)/);
    const os = verMatch ? `Android ${verMatch[1]}` : 'Android';
    const modelMatch = ua.match(/;\s*([^;)]+?)\s+Build\//);
    const model = modelMatch ? modelMatch[1].trim() : label;
    return { label, model, os };
  }

  if (/Macintosh/.test(ua)) return { label, model: 'Mac', os: 'macOS' };
  if (/Windows/.test(ua)) {
    const m = ua.match(/Windows NT ([\d.]+)/);
    const map: Record<string, string> = { '10.0': '10/11', '6.3': '8.1', '6.1': '7' };
    return { label, model: 'PC', os: `Windows ${m ? map[m[1]] ?? '' : ''}`.trim() };
  }
  return { label, model: label, os: '' };
}
