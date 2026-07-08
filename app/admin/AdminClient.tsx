'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { approveDeviceRequest, cleanupMonthlyCheckins, rejectDeviceRequest, resetAllStaffAccess, resetEmployeeAccess } from './actions';

type Employee = { emp_id: string; name: string; role: string; active: boolean; branch: string | null; device_id: string | null };
type Checkin = {
  id: string;
  emp_id: string;
  type: string;
  ts: string;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  location_note: string | null;
  status: string;
  employees: { name: string; branch: string | null };
};
type DeviceRequest = {
  id: string;
  emp_id: string;
  old_device: string | null;
  new_device: string;
  reason: string | null;
  status: string;
  created_at: string;
  employees: { name: string; branch: string | null };
};
type Settings = {
  office_lat: number; office_lng: number; radius_m: number;
  allowed_ssid: string; work_start: string; work_end: string;
  late_tolerance_min?: number; work_days?: string;
} | null;

const C = {
  dark: '#0e0e10',
  lime: '#d6f26b',
  purple: '#a89bf0',
  peach: '#fcdfb1',
  peachDeep: '#f5a85c',
  redSoft: '#ff9d9d',
  redDeep: '#e24b4a',
  mintDeep: '#5dcaa5',
  mint: '#c5f1de',
};

type View = 'daily' | 'weekly' | 'monthly';
type TypeFilter = 'all' | 'in' | 'out' | 'offsite';

export default function AdminClient({
  adminName, monthStr, employees, checkins, settings, deviceRequests, branchNames,
}: {
  adminName: string;
  monthStr: string;
  employees: Employee[];
  checkins: Checkin[];
  settings: Settings;
  deviceRequests: DeviceRequest[];
  branchNames: string[];
}) {
  const [view, setView] = useState<View>('daily');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [search, setSearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [devReqs, setDevReqs] = useState(deviceRequests);
  const [isPending, startTransition] = useTransition();
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const router = useRouter();

  // sync state when server props change (after router.refresh())
  useEffect(() => { setDevReqs(deviceRequests); }, [deviceRequests]);

  function manualRefresh() {
    setLiveNotice('กำลังรีเฟรชข้อมูล...');
    router.refresh();
    setTimeout(() => setLiveNotice(null), 2200);
  }

  function handleApproveDevice(id: string) {
    startTransition(async () => {
      const res = await approveDeviceRequest(id);
      if (!res.error) setDevReqs((list) => list.filter((r) => r.id !== id));
    });
  }
  function handleRejectDevice(id: string) {
    startTransition(async () => {
      const res = await rejectDeviceRequest(id);
      if (!res.error) setDevReqs((list) => list.filter((r) => r.id !== id));
    });
  }

  function handleResetEmployeeAccess(empId: string, name: string) {
    const ok = window.confirm(
      `รีเซ็ตการเข้าใช้งานของ ${name} (${empId})?\n\nระบบจะรีเซ็ตรหัสผ่านกลับเป็น 123456, บังคับเปลี่ยน PIN ใหม่, เคลียร์เครื่องที่ผูกไว้ และลบคำขอเปลี่ยนเครื่องค้างอยู่ โดยไม่ลบประวัติเช็คอิน`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await resetEmployeeAccess(empId);
      setLiveNotice(res.error ?? res.message ?? 'รีเซ็ตสำเร็จ');
      if (!res.error) router.refresh();
    });
  }

  function handleResetAllStaffAccess() {
    const ok = window.confirm(
      'รีเซ็ตพนักงานทุกคน?\n\nระบบจะรีเซ็ตเฉพาะบัญชี staff ที่ active: รหัสผ่านกลับเป็น 123456, บังคับเปลี่ยน PIN ใหม่, เคลียร์เครื่องที่ผูกไว้ และลบคำขอเปลี่ยนเครื่องค้างอยู่ โดยไม่ลบประวัติเช็คอิน',
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await resetAllStaffAccess();
      setLiveNotice(res.error ?? res.message ?? 'รีเซ็ตพนักงานทุกคนสำเร็จ');
      if (!res.error) router.refresh();
    });
  }

  function handleCleanupMonth() {
    const typed = window.prompt(
      `ลบข้อมูลเช็คอินและรูปของเดือน ${monthStr}?\n\nการลบนี้จะลบเฉพาะ checkins และรูปใน checkin-photos ของเดือนนี้ ไม่ลบพนักงาน/PIN/เครื่องที่ผูกไว้\n\nพิมพ์ ${monthStr} เพื่อยืนยัน`,
    );
    if (typed !== monthStr) {
      if (typed !== null) setLiveNotice('ยกเลิก: พิมพ์เดือนไม่ตรง');
      return;
    }
    startTransition(async () => {
      const res = await cleanupMonthlyCheckins(monthStr);
      setLiveNotice(res.error ?? res.message ?? 'ลบข้อมูลสิ้นเดือนสำเร็จ');
      if (!res.error) router.refresh();
    });
  }

  const workStartHr = parseInt(settings?.work_start?.slice(0, 2) ?? '8', 10);
  const workStartMin = parseInt(settings?.work_start?.slice(3, 5) ?? '20', 10);
  const workEndHr = parseInt(settings?.work_end?.slice(0, 2) ?? '16', 10);
  const workEndMin = parseInt(settings?.work_end?.slice(3, 5) ?? '30', 10);
  const tolerance = settings?.late_tolerance_min ?? 5;
  const cutoffMin = workStartHr * 60 + workStartMin + tolerance;
  const workStartTotalMin = workStartHr * 60 + workStartMin;
  const workEndTotalMin = workEndHr * 60 + workEndMin;

  const branches = useMemo(() => {
    const set = new Set<string>();
    branchNames.forEach((b) => b && set.add(b));
    employees.forEach((e) => e.branch && set.add(e.branch));
    return Array.from(set);
  }, [branchNames, employees]);

  const employeeRows = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.emp_id.toLowerCase().includes(q) ||
      (e.branch ?? '').toLowerCase().includes(q),
    );
  }, [employeeSearch, employees]);

  const stats = useMemo(() => {
    const ins = checkins.filter((c) => c.type === 'in');
    const offsites = checkins.filter((c) => c.type.startsWith('offsite'));
    let lateCount = 0;
    ins.forEach((c) => {
      const d = new Date(c.ts);
      const mins = d.getHours() * 60 + d.getMinutes();
      if (mins > cutoffMin) lateCount++;
    });
    const onTime = ins.length - lateCount;
    const onTimeRate = ins.length === 0 ? 0 : Math.round((onTime / ins.length) * 100);
    const lateRate = ins.length === 0 ? 0 : Math.round((lateCount / ins.length) * 100);
    return { total: employees.length, checkinDays: ins.length, onTimeRate, lateRate, lateCount, offsites: offsites.length };
  }, [checkins, employees, cutoffMin]);

  // Daily/weekly/monthly aggregation
  const chartData = useMemo(() => {
    const [y, m] = monthStr.split('-').map(Number);
    if (view === 'monthly') {
      const ins = checkins.filter((c) => c.type === 'in').length;
      const outs = checkins.filter((c) => c.type === 'out').length;
      const offs = checkins.filter((c) => c.type.startsWith('offsite')).length;
      return [{ label: `${y}-${String(m).padStart(2, '0')}`, ins, outs, offs }];
    }
    if (view === 'weekly') {
      const weeks = [1, 8, 15, 22, 29];
      return weeks.map((startDay, i) => {
        const endDay = weeks[i + 1] ? weeks[i + 1] - 1 : 31;
        const ins = checkins.filter((c) => { const d = new Date(c.ts).getDate(); return c.type === 'in' && d >= startDay && d <= endDay; }).length;
        const outs = checkins.filter((c) => { const d = new Date(c.ts).getDate(); return c.type === 'out' && d >= startDay && d <= endDay; }).length;
        const offs = checkins.filter((c) => { const d = new Date(c.ts).getDate(); return c.type.startsWith('offsite') && d >= startDay && d <= endDay; }).length;
        return { label: `สัปดาห์ ${i + 1}`, ins, outs, offs };
      });
    }
    // daily
    const daysInMonth = new Date(y, m, 0).getDate();
    const arr: { label: string; ins: number; outs: number; offs: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) arr.push({ label: String(d), ins: 0, outs: 0, offs: 0 });
    checkins.forEach((c) => {
      const day = new Date(c.ts).getDate();
      if (c.type === 'in') arr[day - 1].ins++;
      if (c.type === 'out') arr[day - 1].outs++;
      if (c.type.startsWith('offsite')) arr[day - 1].offs++;
    });
    return arr;
  }, [checkins, monthStr, view]);

  const maxBar = Math.max(1, ...chartData.map((d) => d.ins + d.outs + d.offs));

  // Filtered history rows
  const historyRows = useMemo(() => {
    return checkins
      .filter((c) => {
        if (typeFilter === 'in' && c.type !== 'in' && c.type !== 'offsite_in') return false;
        if (typeFilter === 'out' && c.type !== 'out' && c.type !== 'offsite_out') return false;
        if (typeFilter === 'offsite' && !c.type.startsWith('offsite')) return false;
        if (branchFilter !== 'all' && c.employees.branch !== branchFilter) return false;
        if (dateFrom && c.ts < `${dateFrom}T00:00:00`) return false;
        if (dateTo && c.ts > `${dateTo}T23:59:59`) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!c.employees.name.toLowerCase().includes(q) && !c.emp_id.toLowerCase().includes(q)) return false;
        }
        return true;
      });
  }, [checkins, typeFilter, branchFilter, dateFrom, dateTo, search]);

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const [year, month] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const generatedAt = new Date();

    wb.Props = {
      Title: `รายงานลงเวลา ${monthStr}`,
      Subject: 'Sakofah staff attendance report',
      Author: adminName,
      CreatedDate: generatedAt,
    };

    const formatDateTime = (ts: string) => new Date(ts).toLocaleString('th-TH');
    const formatTime = (ts: string) => {
      const d = new Date(ts);
      return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
    };
    const formatOtHours = (minutes: number) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}.${String(mins).padStart(2, '0')} ชม.`;
    };
    const minutesOf = (ts: string) => {
      const d = new Date(ts);
      return d.getHours() * 60 + d.getMinutes();
    };
    const dayOf = (ts: string) => new Date(ts).getDate();
    const isInType = (type: string) => type === 'in' || type === 'offsite_in';
    const isOutType = (type: string) => type === 'out' || type === 'offsite_out';
    const isOffsiteType = (type: string) => type.startsWith('offsite');
    const reportIns = checkins.filter((c) => isInType(c.type));
    const reportLateCount = reportIns.filter((c) => minutesOf(c.ts) > workStartTotalMin).length;
    const reportOnTimeRate = reportIns.length === 0 ? 0 : Math.round(((reportIns.length - reportLateCount) / reportIns.length) * 100);
    const reportLateRate = reportIns.length === 0 ? 0 : Math.round((reportLateCount / reportIns.length) * 100);

    const byEmpDay = new Map<string, { in?: Checkin; out?: Checkin }>();
    checkins
      .slice()
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .forEach((c) => {
        const key = `${c.emp_id}|${dayOf(c.ts)}`;
        const bucket = byEmpDay.get(key) ?? {};
        if (isInType(c.type) && !bucket.in) bucket.in = c;
        if (isOutType(c.type)) bucket.out = c;
        byEmpDay.set(key, bucket);
      });

    const employeeStats = employees.map((e) => {
      const empCheckins = checkins.filter((c) => c.emp_id === e.emp_id);
      const ins = empCheckins.filter((c) => isInType(c.type));
      const uniqueInDays = new Set(ins.map((c) => dayOf(c.ts))).size;
      const late = ins.filter((c) => minutesOf(c.ts) > workStartTotalMin).length;
      const lateMinutes = ins.reduce((sum, c) => sum + Math.max(0, minutesOf(c.ts) - workStartTotalMin), 0);
      const offsite = empCheckins.filter((c) => isOffsiteType(c.type)).length;
      const onTime = ins.length - late;
      const onTimeRate = ins.length === 0 ? 0 : Math.round((onTime / ins.length) * 100);
      return { employee: e, checkinDays: uniqueInDays, late, lateMinutes, offsite, onTime, onTimeRate };
    });

    const topExcellent = employeeStats
      .filter((r) => r.checkinDays > 0)
      .sort((a, b) => b.onTimeRate - a.onTimeRate || b.checkinDays - a.checkinDays || a.late - b.late || a.employee.name.localeCompare(b.employee.name))
      .slice(0, 10);
    const topLate = employeeStats
      .filter((r) => r.late > 0)
      .sort((a, b) => b.late - a.late || b.lateMinutes - a.lateMinutes || a.onTimeRate - b.onTimeRate || a.employee.name.localeCompare(b.employee.name))
      .slice(0, 10);
    const dailyLateStats = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const lateIns = checkins.filter((c) => isInType(c.type) && dayOf(c.ts) === day && minutesOf(c.ts) > workStartTotalMin);
      const lateMinutes = lateIns.reduce((sum, c) => sum + Math.max(0, minutesOf(c.ts) - workStartTotalMin), 0);
      return {
        day,
        label: new Date(year, month - 1, day).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
        lateCount: lateIns.length,
        latePeople: new Set(lateIns.map((c) => c.emp_id)).size,
        lateMinutes,
      };
    });
    const maxDailyLate = Math.max(1, ...dailyLateStats.map((r) => r.lateCount));
    const makeBar = (value: number, max: number) => (value === 0 ? '' : '█'.repeat(Math.max(1, Math.round((value / max) * 24))));
    const branchLateStats = Object.values(
      checkins
        .filter((c) => isInType(c.type) && minutesOf(c.ts) > workStartTotalMin)
        .reduce<Record<string, { branch: string; lateCount: number; lateMinutes: number }>>((acc, c) => {
          const branch = c.employees.branch ?? 'ไม่ระบุสาขา';
          acc[branch] ??= { branch, lateCount: 0, lateMinutes: 0 };
          acc[branch].lateCount += 1;
          acc[branch].lateMinutes += Math.max(0, minutesOf(c.ts) - workStartTotalMin);
          return acc;
        }, {}),
    ).sort((a, b) => b.lateCount - a.lateCount || b.lateMinutes - a.lateMinutes);
    const isHeadOfficeBranch = (branch?: string | null) => {
      const normalized = (branch ?? '').trim().toLowerCase();
      return normalized === 'สำนักงานใหญ่' || normalized.includes('สำนักงานใหญ่') || normalized.includes('head office');
    };
    const branchOrder = new Map<string, number>();
    branches.forEach((branch) => {
      if (branch && !branchOrder.has(branch)) branchOrder.set(branch, branchOrder.size);
    });
    const sortedEmployeeStats = employeeStats.slice().sort((a, b) => {
      const aBranch = a.employee.branch ?? '';
      const bBranch = b.employee.branch ?? '';
      const aHeadOffice = isHeadOfficeBranch(aBranch);
      const bHeadOffice = isHeadOfficeBranch(bBranch);
      if (aHeadOffice !== bHeadOffice) return aHeadOffice ? -1 : 1;
      const branchDiff = (branchOrder.get(aBranch) ?? Number.MAX_SAFE_INTEGER) - (branchOrder.get(bBranch) ?? Number.MAX_SAFE_INTEGER);
      if (branchDiff !== 0) return branchDiff;
      return a.employee.name.localeCompare(b.employee.name, 'th') || a.employee.emp_id.localeCompare(b.employee.emp_id);
    });

    const summary: (string | number)[][] = [
      ['รายงานลงเวลาพนักงาน', 'Sakofah Islamic'],
      ['เดือน', monthStr],
      ['ออกโดย', adminName],
      ['สร้างเมื่อ', generatedAt.toLocaleString('th-TH')],
      [],
      ['สรุปภาพรวม', '', '', 'เวลาทำการ', `${settings?.work_start} - ${settings?.work_end}`],
      ['พนักงานทั้งหมด', `${stats.total} คน`, '', 'Tolerance สาย', `${tolerance} นาที`],
      ['รายการเช็คอิน', `${stats.checkinDays} ครั้ง`, '', 'วันทำการ', settings?.work_days === 'MTWTF' ? 'จันทร์-ศุกร์' : 'ทุกวัน'],
      ['มาตรงเวลา', `${reportOnTimeRate}%`, '', 'จำนวนรายการที่มาสาย', `${reportLateCount} ครั้ง`],
      ['มาสาย', `${reportLateRate}%`, '', 'ลงเวลานอกสถานที่', `${stats.offsites} ครั้ง`],
      [],
      ['กราฟวันที่พนักงานมาสาย', '', '', '', ''],
      ['วันที่', 'จำนวนครั้งที่สาย', 'จำนวนคน', 'นาทีสายรวม', 'กราฟ'],
      ...dailyLateStats.map((r) => [r.label, r.lateCount, r.latePeople, r.lateMinutes, makeBar(r.lateCount, maxDailyLate)]),
      [],
      ['สถิติสาขาที่มีรายการมาสาย', '', '', '', ''],
      ['สาขา', 'มาสาย (ครั้ง)', 'นาทีสายรวม', 'เฉลี่ย/ครั้ง', 'กราฟ'],
      ...branchLateStats.map((r) => [r.branch, r.lateCount, r.lateMinutes, r.lateCount === 0 ? 0 : Math.round(r.lateMinutes / r.lateCount), makeBar(r.lateCount, Math.max(1, ...branchLateStats.map((b) => b.lateCount)))]),
      [],
      ['พนักงานดีเด่น 10 คนแรก', '', '', '', '', '', 'สถิติคนมาสาย 10 คนแรก'],
      ['อันดับ', 'ชื่อ-สกุล', 'สาขา', 'วันเช็คอิน', 'ตรงเวลา (%)', '', 'อันดับ', 'ชื่อ-สกุล', 'สาขา', 'มาสาย (ครั้ง)', 'นาทีสายรวม'],
      ...Array.from({ length: 10 }, (_, i) => {
        const good = topExcellent[i];
        const late = topLate[i];
        return [
          good ? i + 1 : '',
          good?.employee.name ?? '',
          good?.employee.branch ?? '',
          good?.checkinDays ?? '',
          good ? `${good.onTimeRate}%` : '',
          '',
          late ? i + 1 : '',
          late?.employee.name ?? '',
          late?.employee.branch ?? '',
          late?.late ?? '',
          late?.lateMinutes ?? '',
        ];
      }),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1['!cols'] = [
      { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 28 },
      { wch: 4 }, { wch: 10 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
    ];
    ws1['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
      { s: { r: 10, c: 0 }, e: { r: 10, c: 4 } },
      { s: { r: 13 + daysInMonth, c: 0 }, e: { r: 13 + daysInMonth, c: 4 } },
      { s: { r: 16 + daysInMonth + branchLateStats.length, c: 0 }, e: { r: 16 + daysInMonth + branchLateStats.length, c: 4 } },
      { s: { r: 16 + daysInMonth + branchLateStats.length, c: 6 }, e: { r: 16 + daysInMonth + branchLateStats.length, c: 10 } },
    ];
    ws1['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 11, c: 0 }, e: { r: 11 + daysInMonth, c: 4 } }) };
    XLSX.utils.book_append_sheet(wb, ws1, 'สรุปภาพรวม');

    const empHeader1: (string | number)[] = ['รหัสพนักงาน', 'ชื่อ', 'สาขา', 'ตำแหน่ง', 'วันเช็คอิน', 'สาย (ครั้ง)', 'นอกสถานที่', 'ตรงเวลา %'];
    const empHeader2: (string | number)[] = ['', '', '', '', '', '', '', ''];
    for (let day = 1; day <= daysInMonth; day++) {
      empHeader1.push(`วันที่ ${day}`, '');
      empHeader2.push('เข้า', 'ออก');
    }

    const empRows: (string | number)[][] = [empHeader1, empHeader2];
    sortedEmployeeStats.forEach(({ employee: e, checkinDays, late, offsite, onTimeRate }) => {
      const row: (string | number)[] = [e.emp_id, e.name, e.branch ?? '', e.role, checkinDays, late, offsite, onTimeRate];
      for (let day = 1; day <= daysInMonth; day++) {
        const pair = byEmpDay.get(`${e.emp_id}|${day}`);
        const lateMinutes = pair?.in ? Math.max(0, minutesOf(pair.in.ts) - workStartTotalMin) : 0;
        const earlyMinutes = pair?.out ? Math.max(0, workEndTotalMin - minutesOf(pair.out.ts)) : 0;
        const otMinutes = pair?.out ? Math.max(0, minutesOf(pair.out.ts) - workEndTotalMin) : 0;
        const inValue = pair?.in
          ? `${formatTime(pair.in.ts)}${lateMinutes > 0 ? ` (${lateMinutes} นาที)` : ''}${isOffsiteType(pair.in.type) ? ' นอก' : ''}`
          : '';
        const outValue = pair?.out
          ? `${formatTime(pair.out.ts)}${earlyMinutes > 0 ? ` (${earlyMinutes} นาที)` : otMinutes > 0 ? ` (OT ${formatOtHours(otMinutes)})` : ''}${isOffsiteType(pair.out.type) ? ' นอก' : ''}`
          : '';
        row.push(inValue, outValue);
      }
      empRows.push(row);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(empRows);
    ws3['!cols'] = [
      { wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      ...Array.from({ length: daysInMonth * 2 }, (_, i) => ({ wch: i % 2 === 0 ? 10 : 9 })),
    ];
    ws3['!merges'] = [
      ...Array.from({ length: 8 }, (_, c) => ({ s: { r: 0, c }, e: { r: 1, c } })),
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const c = 8 + i * 2;
        return { s: { r: 0, c }, e: { r: 0, c: c + 1 } };
      }),
    ];
    ws3['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: empRows.length - 1, c: empRows[0].length - 1 } }) };
    const onTimeCellStyle = {
      fill: { fgColor: { rgb: 'C6E0B4' } },
      font: { color: { rgb: '274E13' }, bold: true },
      alignment: { horizontal: 'center' },
    };
    const warningCellStyle = {
      fill: { fgColor: { rgb: 'F4CCCC' } },
      font: { color: { rgb: '9C0006' }, bold: true },
      alignment: { horizontal: 'center' },
    };
    sortedEmployeeStats.forEach(({ employee: e }, rowIndex) => {
      for (let day = 1; day <= daysInMonth; day++) {
        const pair = byEmpDay.get(`${e.emp_id}|${day}`);
        const inCol = 8 + (day - 1) * 2;
        const outCol = inCol + 1;
        const row = rowIndex + 2;
        const inAddr = XLSX.utils.encode_cell({ r: row, c: inCol });
        const outAddr = XLSX.utils.encode_cell({ r: row, c: outCol });
        if (pair?.in && ws3[inAddr]) {
          ws3[inAddr].s = minutesOf(pair.in.ts) > workStartTotalMin ? warningCellStyle : onTimeCellStyle;
        }
        if (pair?.out && ws3[outAddr]) {
          ws3[outAddr].s = minutesOf(pair.out.ts) < workEndTotalMin ? warningCellStyle : onTimeCellStyle;
        }
      }
    });
    XLSX.utils.book_append_sheet(wb, ws3, 'รายพนักงาน');

    const logRows: (string | number)[][] = [
      ['ประวัติการลงเวลาทั้งหมด', monthStr],
      ['สร้างเมื่อ', generatedAt.toLocaleString('th-TH')],
      [],
      ['วันที่-เวลา', 'รหัสพนักงาน', 'ชื่อ', 'สาขา', 'ประเภท', 'สาย (นาที)', 'เลิกก่อน (นาที)', 'พิกัด', 'สถานที่ Off-site'],
    ];
    checkins.slice().sort((a, b) => a.ts.localeCompare(b.ts)).forEach((c) => {
      const isIn = c.type === 'in' || c.type === 'offsite_in';
      const isOut = c.type === 'out' || c.type === 'offsite_out';
      const d = new Date(c.ts);
      const mins = d.getHours() * 60 + d.getMinutes();
      const late = isIn ? Math.max(0, mins - workStartTotalMin) : 0;
      const early = isOut ? Math.max(0, workEndTotalMin - mins) : 0;
      logRows.push([
        formatDateTime(c.ts),
        c.emp_id, c.employees.name, c.employees.branch ?? '',
        typeLabel(c.type),
        late, early,
        c.lat && c.lng ? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` : '',
        c.location_note ?? '',
      ]);
    });
    const ws4 = XLSX.utils.aoa_to_sheet(logRows);
    ws4['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 26 }, { wch: 30 }];
    ws4['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws4['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: logRows.length - 1, c: 8 } }) };
    XLSX.utils.book_append_sheet(wb, ws4, 'ประวัติทั้งหมด');

    XLSX.writeFile(wb, `รายงานลงเวลา_${monthStr}_${Date.now()}.xlsx`, { cellStyles: true });
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 18 }}>
      {/* Live notice */}
      {liveNotice && (
        <div style={{
          position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)',
          background: '#0e0e10', color: '#d6f26b',
          padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 20px rgba(0,0,0,0.18)', zIndex: 100,
          animation: 'pop-in 0.2s ease-out',
        }}>{liveNotice}</div>
      )}
      <style>{`@keyframes pop-in { from { opacity: 0; transform: translateX(-50%) translateY(-8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: '#5c5c60', display: 'flex', alignItems: 'center', gap: 6 }}>
            Sakofah Islamic · Admin · {adminName}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600,
              background: 'rgba(133,79,11,0.15)',
              color: '#854f0b',
              padding: '2px 8px', borderRadius: 999,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: '#ba7517' }} />
              MANUAL
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>รายงานประจำเดือน {monthStr}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Link href="/checkin" style={{ background: '#fff', color: C.dark, border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '7px 12px', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-home" style={{ fontSize: 13 }} aria-hidden></i>ไปหน้าเช็คอิน
          </Link>
          <button onClick={manualRefresh} disabled={isPending} style={{ background: '#fff', color: C.dark, border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.55 : 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-refresh" style={{ fontSize: 13 }} aria-hidden></i>รีเฟรชข้อมูล
          </button>
          <input type="month" defaultValue={monthStr} onChange={(e) => { window.location.href = `/admin?month=${e.target.value}`; }}
            style={{ background: '#fff', borderRadius: 10, padding: '6px 12px', border: '0.5px solid rgba(0,0,0,0.1)', fontSize: 12 }} />
          <button onClick={handleCleanupMonth} disabled={isPending} style={{ background: '#fff', color: '#a32d2d', border: '0.5px solid rgba(163,45,45,0.25)', borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.55 : 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-trash" style={{ fontSize: 13 }} aria-hidden></i>ลบข้อมูลเดือนนี้
          </button>
          <button onClick={exportExcel} style={{ background: C.dark, color: C.lime, border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-file-spreadsheet" style={{ fontSize: 14 }} aria-hidden></i>Export Excel
          </button>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiCard label="พนักงาน" value={stats.total} bg={C.purple} textCol="#0e0e10" />
        <KpiCard label="มาตรงเวลา" value={`${stats.onTimeRate}%`} bg={C.lime} textCol={C.dark} />
        <KpiCard label="มาสาย" value={`${stats.lateRate}%`} sub={`${stats.lateCount} ครั้ง`} bg={C.redDeep} textCol="#fff" />
        <KpiCard label="นอกสถานที่" value={stats.offsites} sub="ครั้ง" bg="#FFA02E" textCol="#0e0e10" />
      </div>

      {/* Check-in/out table — full width */}
      <div style={{ background: C.dark, color: '#fff', borderRadius: 18, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>ตารางเช็คอิน/เอาท์ · {stats.total} คน</div>
            <div style={{ fontSize: 11, color: '#8e8e92', marginTop: 2 }}>{stats.checkinDays} วันเช็คอิน</div>
          </div>
          <SegmentedControl value={view} onChange={setView} options={[
            { value: 'daily', label: 'รายวัน' },
            { value: 'weekly', label: 'รายสัปดาห์' },
            { value: 'monthly', label: 'รายเดือน' },
          ]} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <Legend color={C.lime} label="เช็คอิน" />
          <Legend color={C.redSoft} label="เช็คเอาท์" />
          <Legend color="#a89bf0" label="นอกสถานที่" />
        </div>

        <svg viewBox="0 0 600 140" style={{ width: '100%', height: 160 }}>
          {chartData.map((d, i) => {
            const x = 10 + i * (580 / chartData.length);
            const w = (580 / chartData.length) - 4;
            const insH = (d.ins / maxBar) * 100;
            const outsH = (d.outs / maxBar) * 100;
            const offsH = (d.offs / maxBar) * 100;
            return (
              <g key={i}>
                <rect x={x} y={130 - insH} width={w} height={insH} fill={C.lime} rx={2} />
                <rect x={x} y={130 - insH - outsH} width={w} height={outsH} fill={C.redSoft} rx={2} />
                <rect x={x} y={130 - insH - outsH - offsH} width={w} height={offsH} fill="#a89bf0" rx={2} />
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8e8e92', marginTop: 4 }}>
          {view === 'daily' && <><span>1</span><span>10</span><span>20</span><span>{chartData.length}</span></>}
          {view === 'weekly' && chartData.map((d, i) => <span key={i}>{d.label}</span>)}
          {view === 'monthly' && <span>{chartData[0].label}</span>}
        </div>
      </div>

      {/* History table with filters */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, border: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>ประวัติทั้งหมด · {historyRows.length} รายการ</div>
          <SegmentedControl value={typeFilter} onChange={setTypeFilter} options={[
            { value: 'all', label: 'ทั้งหมด' },
            { value: 'in', label: 'เข้า' },
            { value: 'out', label: 'ออก' },
            { value: 'offsite', label: 'นอกสถานที่' },
          ]} light />
        </div>

        {/* Filter row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ/รหัส..." style={inputStyle} />
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} style={inputStyle}>
            <option value="all">ทุกสาขา</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
        </div>

        {/* Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 500, overflowY: 'auto' }}>
          {historyRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#5c5c60', fontSize: 12 }}>ไม่พบรายการตามที่กรอง</div>
          ) : (
            historyRows.map((c) => {
              const tInfo = typeInfo(c.type);
              const isIn = c.type === 'in' || c.type === 'offsite_in';
              const isOut = c.type === 'out' || c.type === 'offsite_out';
              const d = new Date(c.ts);
              const mins = d.getHours() * 60 + d.getMinutes();
              const late = isIn ? Math.max(0, mins - workStartTotalMin) : 0;
              const early = isOut ? Math.max(0, workEndTotalMin - mins) : 0;
              return (
                <div key={c.id} style={{ background: '#f4f2ec', borderRadius: 12, padding: 10, display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 10, alignItems: 'center' }}>
                  {c.photo_url ? (
                    <img src={c.photo_url} style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 46, height: 46, borderRadius: 10, background: tInfo.bg, color: tInfo.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className={`ti ti-${tInfo.icon}`} style={{ fontSize: 22 }} aria-hidden></i>
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {c.employees.name}
                      <span style={{ background: tInfo.bg, color: tInfo.color, padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600 }}>{tInfo.label}</span>
                      {late > 0 && <span style={{ background: '#fcc6c6', color: '#a32d2d', padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600 }}>สาย {late} นาที</span>}
                      {early > 0 && <span style={{ background: '#fcdfb1', color: '#854f0b', padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600 }}>เลิกก่อน {early} นาที</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#5c5c60', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.emp_id} · {c.employees.branch ?? '-'}{c.location_note ? ` · ${c.location_note}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: '#5c5c60' }}>
                    <div>{new Date(c.ts).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</div>
                    <div style={{ fontWeight: 600, color: '#0e0e10' }}>{new Date(c.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Device change requests */}
      {devReqs.length > 0 && (
        <div style={{ background: '#fcdfb1', borderRadius: 18, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#412402' }}>
                <i className="ti ti-device-mobile-cog" style={{ fontSize: 16, marginRight: 6, verticalAlign: -3 }} aria-hidden></i>
                คำขอเปลี่ยนเครื่อง
              </div>
              <div style={{ fontSize: 11, color: '#854f0b' }}>อนุมัติเพื่อผูกเครื่องใหม่กับพนักงาน</div>
            </div>
            <span style={{ background: '#0e0e10', color: '#d6f26b', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>{devReqs.length} รายการ</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {devReqs.map((r) => (
              <div key={r.id} style={{ background: '#fff', borderRadius: 14, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: C.lime, color: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                    {r.employees.name.slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.employees.name}</div>
                    <div style={{ fontSize: 11, color: '#5c5c60' }}>{r.emp_id} · {r.employees.branch ?? '-'}</div>
                  </div>
                  <span style={{ fontSize: 10, color: '#5c5c60' }}>{new Date(r.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</span>
                </div>

                <div style={{ background: '#f4f2ec', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
                    <div>
                      <div style={{ color: '#5c5c60', fontSize: 10 }}>เครื่องเดิม</div>
                      <div style={{ color: '#0e0e10', wordBreak: 'break-all' }}>{r.old_device ?? '— ไม่มีข้อมูล —'}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11 }}>
                    <div style={{ color: '#0f6e56', fontSize: 10 }}>เครื่องใหม่</div>
                    <div style={{ color: '#04342c', fontWeight: 500, wordBreak: 'break-all' }}>{r.new_device}</div>
                  </div>
                </div>

                {r.reason && (
                  <div style={{ background: '#f4f2ec', borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 11 }}>
                    <div style={{ color: '#5c5c60', fontSize: 10, marginBottom: 2 }}>เหตุผล</div>
                    <div style={{ color: '#0e0e10' }}>{r.reason}</div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button onClick={() => handleApproveDevice(r.id)} disabled={isPending}
                    style={{ background: C.lime, color: C.dark, border: 'none', borderRadius: 10, padding: '8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <i className="ti ti-check" style={{ fontSize: 13, marginRight: 4 }} aria-hidden></i>อนุมัติ
                  </button>
                  <button onClick={() => handleRejectDevice(r.id)} disabled={isPending}
                    style={{ background: '#fff', color: '#a32d2d', border: '0.5px solid rgba(163,45,45,0.3)', borderRadius: 10, padding: '8px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    <i className="ti ti-x" style={{ fontSize: 13, marginRight: 4 }} aria-hidden></i>ปฏิเสธ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employee summary — white */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 16, border: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>สรุปพนักงาน {employees.length} คน</div>
            <div style={{ fontSize: 11, color: '#5c5c60', marginTop: 2 }}>ข้อมูลหน้านี้จะอัปเดตเมื่อกดรีเฟรชเอง</div>
            <input
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder="ค้นหาชื่อ/รหัส/สาขา..."
              style={{ ...inputStyle, width: 220, marginTop: 10 }}
            />
          </div>
          <button onClick={handleResetAllStaffAccess} disabled={isPending} style={{ background: '#fff', color: '#a32d2d', border: '0.5px solid rgba(163,45,45,0.25)', borderRadius: 10, padding: '7px 11px', fontSize: 12, fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.55 : 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-refresh-alert" style={{ fontSize: 13 }} aria-hidden></i>Reset
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {employeeRows.map((e) => {
            const empIns = checkins.filter((c) => c.emp_id === e.emp_id && c.type === 'in');
            const empLate = empIns.filter((c) => { const d = new Date(c.ts); return d.getHours() * 60 + d.getMinutes() > cutoffMin; }).length;
            return (
              <div key={e.emp_id} style={{ background: '#f4f2ec', borderRadius: 12, padding: '10px 12px', display: 'grid', gridTemplateColumns: '36px 1fr auto', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: e.role === 'admin' ? C.dark : C.lime, color: e.role === 'admin' ? C.lime : C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                  {e.name.slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                  <div style={{ fontSize: 10, color: '#5c5c60' }}>
                    {e.emp_id} · {e.branch ?? '-'} · {empIns.length} วัน
                    {empLate > 0 && <span style={{ color: '#a32d2d' }}> · สาย {empLate}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleResetEmployeeAccess(e.emp_id, e.name)}
                  disabled={isPending}
                  title="รีเซ็ตรหัสผ่านและผูกเครื่องใหม่"
                  style={{
                    width: 34, height: 34, borderRadius: 10,
                    border: '0.5px solid rgba(163,45,45,0.25)',
                    background: '#fff', color: '#a32d2d',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.5 : 1,
                  }}
                >
                  <i className="ti ti-refresh-alert" style={{ fontSize: 17 }} aria-hidden></i>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#f4f2ec', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 10px', fontSize: 12, color: '#0e0e10', outline: 'none', minWidth: 0,
};

function KpiCard({ label, value, sub, bg, textCol }: { label: string; value: number | string; sub?: string; bg: string; textCol: string }) {
  return (
    <div style={{ background: bg, color: textCol, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 11, opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>
        {value}{sub && <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}> {sub}</span>}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({ value, onChange, options, light }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; light?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', background: light ? '#f4f2ec' : '#1a1a1c', borderRadius: 999, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            background: active ? (light ? '#0e0e10' : '#d6f26b') : 'transparent',
            color: active ? (light ? '#d6f26b' : '#0e0e10') : (light ? '#5c5c60' : '#c9c9cc'),
            border: 'none', borderRadius: 999, padding: '5px 11px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#c9c9cc' }}>
      <span style={{ width: 8, height: 8, background: color, borderRadius: 2 }} />{label}
    </span>
  );
}

function typeLabel(t: string) {
  return t === 'in' ? 'เช็คอิน' : t === 'out' ? 'เช็คเอาท์' : t === 'offsite_in' ? 'นอกสถานที่ (เข้า)' : 'นอกสถานที่ (ออก)';
}

function typeInfo(t: string) {
  if (t === 'in') return { label: 'เข้า', icon: 'login-2', bg: '#d6f26b', color: '#0e0e10' };
  if (t === 'out') return { label: 'ออก', icon: 'logout-2', bg: '#ff9d9d', color: '#501313' };
  if (t === 'offsite_in') return { label: 'นอก·เข้า', icon: 'map-pin-up', bg: '#a89bf0', color: '#26215c' };
  return { label: 'นอก·ออก', icon: 'map-pin-down', bg: '#f5a85c', color: '#5c4520' };
}
