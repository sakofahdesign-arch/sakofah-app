export const EMPLOYEE_DAY_WARNING_FILL = 'F4CCCC';
export const EMPLOYEE_DAY_ON_TIME_FILL = 'C6E0B4';
export const EMPLOYEE_DAY_LEAVE_FILL = 'FFF2CC';

export type HrLeaveRequest = {
  empId: string;
  type: string;
  start: string | Date;
  end: string | Date;
  status?: string;
};

export type AttendanceDayWarningInput = {
  inMinutes?: number;
  outMinutes?: number;
  workStart: number;
  tolerance: number;
  workEnd: number;
};

export function getAttendanceDayWarning({
  inMinutes,
  outMinutes,
  workStart,
  tolerance,
  workEnd,
}: AttendanceDayWarningInput): boolean {
  const isLate = inMinutes !== undefined && inMinutes > workStart + tolerance;
  const isEarly = outMinutes !== undefined && outMinutes < workEnd;
  return isLate || isEarly;
}

export function getEmployeeDayCellStyle(isWarningDay: boolean) {
  return {
    fill: { fgColor: { rgb: isWarningDay ? EMPLOYEE_DAY_WARNING_FILL : EMPLOYEE_DAY_ON_TIME_FILL } },
    font: { color: { rgb: isWarningDay ? '9C0006' : '274E13' }, bold: true },
    alignment: { horizontal: 'center' },
  };
}

export function getEmployeeLeaveCellStyle() {
  return {
    fill: { fgColor: { rgb: EMPLOYEE_DAY_LEAVE_FILL } },
    font: { color: { rgb: '7F6000' }, bold: true },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
}

type DateParts = { year: number; month: number; day: number };

function parseLeaveDate(value: string | Date): DateParts | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }

  const raw = String(value || '').trim();
  if (!raw) return null;

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const rawYear = Number(slashMatch[3]);
    const year = rawYear > 2400 ? rawYear - 543 : rawYear;
    return { year, month, day };
  }

  const dashMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dashMatch) {
    const rawYear = Number(dashMatch[1]);
    const year = rawYear > 2400 ? rawYear - 543 : rawYear;
    return { year, month: Number(dashMatch[2]), day: Number(dashMatch[3]) };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return { year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate() };
}

function toLocalDate(parts: DateParts) {
  return new Date(parts.year, parts.month - 1, parts.day);
}

function isApprovedStatus(status: string | undefined) {
  return String(status || '').trim() === 'Approved';
}

export function buildApprovedLeaveDayMap(leaves: HrLeaveRequest[], reportYear: number, reportMonth: number) {
  const result = new Map<string, string>();
  const monthStart = new Date(reportYear, reportMonth - 1, 1);
  const monthEnd = new Date(reportYear, reportMonth, 0);

  leaves.forEach((leave) => {
    const empId = String(leave.empId || '').trim();
    const type = String(leave.type || '').trim();
    if (!empId || !type || !isApprovedStatus(leave.status)) return;

    const startParts = parseLeaveDate(leave.start);
    const endParts = parseLeaveDate(leave.end);
    if (!startParts || !endParts) return;

    let current = toLocalDate(startParts);
    const end = toLocalDate(endParts);
    if (current > end) return;

    if (current < monthStart) current = new Date(monthStart);
    const lastDay = end < monthEnd ? end : monthEnd;
    while (current <= lastDay) {
      const day = current.getDate();
      const key = `${empId}|${day}`;
      const existing = result.get(key);
      result.set(key, existing ? `${existing}, ${type}` : type);
      current.setDate(current.getDate() + 1);
    }
  });

  return result;
}
