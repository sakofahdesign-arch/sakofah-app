export const EMPLOYEE_DAY_WARNING_FILL = 'F4CCCC';
export const EMPLOYEE_DAY_ON_TIME_FILL = 'C6E0B4';

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
