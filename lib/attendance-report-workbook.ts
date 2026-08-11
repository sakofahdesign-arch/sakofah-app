import XLSX from 'xlsx-js-style';
import {
  buildApprovedLeaveDayMap,
  getAttendanceDayWarning,
  getEmployeeDayCellStyle,
  getEmployeeLeaveCellStyle,
  type HrLeaveRequest,
} from './attendance-report-excel';

export type AttendanceReportEmployee = { emp_id: string; name: string; role: string; active: boolean; branch: string | null; device_id: string | null };
export type AttendanceReportCheckin = {
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
export type AttendanceReportSettings = {
  office_lat: number; office_lng: number; radius_m: number;
  allowed_ssid: string; work_start: string; work_end: string;
  late_tolerance_min?: number; work_days?: string;
} | null;

type Checkin = AttendanceReportCheckin;

export type BuildAttendanceReportWorkbookInput = {
  adminName: string;
  monthStr: string;
  employees: AttendanceReportEmployee[];
  checkins: AttendanceReportCheckin[];
  settings: AttendanceReportSettings;
  branchNames: string[];
  leaveRequests: HrLeaveRequest[];
  generatedAt?: Date;
};

export function makeAttendanceReportFileName(monthStr: string) {
  return `attendance-report-${monthStr}.xlsx`;
}

function buildReportBranches(branchNames: string[], employees: AttendanceReportEmployee[]) {
  const set = new Set<string>();
  branchNames.forEach((branch) => branch && set.add(branch));
  employees.forEach((employee) => employee.branch && set.add(employee.branch));
  return Array.from(set);
}

function buildReportStats({
  employees, checkins, isInType, isOffsiteType, minutesOf, cutoffMin,
}: {
  employees: AttendanceReportEmployee[];
  checkins: AttendanceReportCheckin[];
  isInType: (type: string) => boolean;
  isOffsiteType: (type: string) => boolean;
  minutesOf: (ts: string) => number;
  cutoffMin: number;
}) {
  const ins = checkins.filter((checkin) => isInType(checkin.type));
  const offsites = checkins.filter((checkin) => isOffsiteType(checkin.type));
  const lateCount = ins.filter((checkin) => minutesOf(checkin.ts) > cutoffMin).length;
  const onTime = ins.length - lateCount;
  const onTimeRate = ins.length === 0 ? 0 : Math.round((onTime / ins.length) * 100);
  const lateRate = ins.length === 0 ? 0 : Math.round((lateCount / ins.length) * 100);
  return { total: employees.length, checkinDays: ins.length, onTimeRate, lateRate, lateCount, offsites: offsites.length };
}

export function buildAttendanceReportWorkbook(input: BuildAttendanceReportWorkbookInput) {
  const { adminName, monthStr, employees, checkins, settings, branchNames, leaveRequests } = input;

  const wb = XLSX.utils.book_new();
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const generatedAt = input.generatedAt ?? new Date();
  const leaveDayMap = buildApprovedLeaveDayMap(leaveRequests, year, month);

  const workStartHr = parseInt(settings?.work_start?.slice(0, 2) ?? '8', 10);
  const workStartMin = parseInt(settings?.work_start?.slice(3, 5) ?? '20', 10);
  const workEndHr = parseInt(settings?.work_end?.slice(0, 2) ?? '16', 10);
  const workEndMin = parseInt(settings?.work_end?.slice(3, 5) ?? '30', 10);
  const tolerance = settings?.late_tolerance_min ?? 5;
  const workStartTotalMin = workStartHr * 60 + workStartMin;
  const workEndTotalMin = workEndHr * 60 + workEndMin;

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
  const branches = buildReportBranches(branchNames, employees);
  const stats = buildReportStats({ employees, checkins, isInType, isOffsiteType, minutesOf, cutoffMin: workStartTotalMin + tolerance });
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
      const leaveLabel = leaveDayMap.get(`${e.emp_id}|${day}`);
      if (leaveLabel) {
        row.push(leaveLabel, '');
        continue;
      }

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
    ...sortedEmployeeStats.flatMap(({ employee: e }, rowIndex) => (
      Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const c = 8 + i * 2;
        const r = rowIndex + 2;
        return leaveDayMap.has(`${e.emp_id}|${day}`) ? [{ s: { r, c }, e: { r, c: c + 1 } }] : [];
      }).flat()
    )),
  ];
  ws3['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: empRows.length - 1, c: empRows[0].length - 1 } }) };
  sortedEmployeeStats.forEach(({ employee: e }, rowIndex) => {
    for (let day = 1; day <= daysInMonth; day++) {
      const leaveLabel = leaveDayMap.get(`${e.emp_id}|${day}`);
      const pair = byEmpDay.get(`${e.emp_id}|${day}`);
      const inCol = 8 + (day - 1) * 2;
      const outCol = inCol + 1;
      const row = rowIndex + 2;
      const inAddr = XLSX.utils.encode_cell({ r: row, c: inCol });
      const outAddr = XLSX.utils.encode_cell({ r: row, c: outCol });
      if (leaveLabel) {
        const leaveCellStyle = getEmployeeLeaveCellStyle();
        ws3[inAddr] ??= { t: 's', v: leaveLabel };
        ws3[inAddr].s = leaveCellStyle;
        ws3[outAddr] ??= { t: 's', v: '' };
        ws3[outAddr].s = leaveCellStyle;
        continue;
      }

      if (!pair?.in && !pair?.out) continue;
      const isWarningDay = getAttendanceDayWarning({
        inMinutes: pair.in ? minutesOf(pair.in.ts) : undefined,
        outMinutes: pair.out ? minutesOf(pair.out.ts) : undefined,
        workStart: workStartTotalMin,
        tolerance,
        workEnd: workEndTotalMin,
      });
      const dayCellStyle = getEmployeeDayCellStyle(isWarningDay);
      if (pair.in || isWarningDay) {
        ws3[inAddr] ??= { t: 's', v: '' };
        ws3[inAddr].s = dayCellStyle;
      }
      if (pair.out || isWarningDay) {
        ws3[outAddr] ??= { t: 's', v: '' };
        ws3[outAddr].s = dayCellStyle;
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
  return wb;

}

function typeLabel(t: string) {
  return t === 'in' ? '???????' : t === 'out' ? '?????????' : t === 'offsite_in' ? '?????????? (????)' : '?????????? (???)';
}
