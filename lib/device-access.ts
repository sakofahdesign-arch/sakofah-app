export type DeviceAccessStatus = 'checking' | 'allowed' | 'unbound' | 'mismatch';

export type DeviceAccess = {
  status: DeviceAccessStatus;
  blocked: boolean;
};

export type DeviceAccessNotice = {
  title: string;
  message: string;
  actionLabel: string;
  actionHref: string;
};

export function resolveDeviceAccess(
  role: string | null,
  boundDeviceId: string | null,
  currentDeviceId: string | null,
): DeviceAccess {
  if (!role) return { status: 'checking', blocked: true };
  if (role === 'admin') return { status: 'allowed', blocked: false };
  if (!boundDeviceId) return { status: 'unbound', blocked: true };
  if (!currentDeviceId) return { status: 'checking', blocked: true };
  if (boundDeviceId !== currentDeviceId) return { status: 'mismatch', blocked: true };
  return { status: 'allowed', blocked: false };
}

export function getDeviceAccessNotice(status: DeviceAccessStatus): DeviceAccessNotice | null {
  if (status === 'mismatch') {
    return {
      title: 'บัญชีนี้ไม่ตรงกับเครื่องที่ใช้งาน',
      message: 'กรุณาส่งคำขอเปลี่ยนเครื่องและรอผู้ดูแลระบบอนุมัติก่อนลงเวลา',
      actionLabel: 'ไปหน้าขอเปลี่ยนเครื่อง',
      actionHref: '/account/device',
    };
  }

  if (status === 'unbound') {
    return {
      title: 'ยังไม่ได้ผูกเครื่อง',
      message: 'กรุณาผูกเครื่องนี้ก่อนลงเวลา',
      actionLabel: 'ไปหน้าผูกเครื่อง',
      actionHref: '/account/device/bind',
    };
  }

  return null;
}
