export const ATTENDANCE_ARCHIVE_BUCKET = 'attendance-report-archives';

export type DateRangeValidationResult =
  | { ok: true; monthStr: string; startIso: string; endExclusiveIso: string }
  | { ok: false; error: string };

export type ExportDecision =
  | { kind: 'live' }
  | { kind: 'archive' }
  | { kind: 'none' };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function formatBangkokYmd(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function validateSingleMonthDateRange(dateFrom: string, dateTo: string): DateRangeValidationResult {
  const from = DATE_RE.exec(dateFrom);
  const to = DATE_RE.exec(dateTo);
  if (!from || !to) return { ok: false, error: 'กรุณาเลือกวันที่ให้ครบ' };
  if (`${from[1]}-${from[2]}` !== `${to[1]}-${to[2]}`) {
    return { ok: false, error: 'กรุณาเลือกช่วงวันที่ให้อยู่ในเดือนเดียวกัน' };
  }
  if (dateTo < dateFrom) return { ok: false, error: 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น' };

  const monthStr = `${from[1]}-${from[2]}`;
  const endDate = new Date(`${dateTo}T00:00:00.000+07:00`);
  endDate.setDate(endDate.getDate() + 1);

  return {
    ok: true,
    monthStr,
    startIso: `${dateFrom}T00:00:00.000+07:00`,
    endExclusiveIso: `${formatBangkokYmd(endDate)}T00:00:00.000+07:00`,
  };
}

export function monthKeyFromDateRange(dateFrom: string, dateTo: string) {
  const result = validateSingleMonthDateRange(dateFrom, dateTo);
  if (!result.ok) throw new Error(result.error);
  return result.monthStr;
}

export function makeArchiveStoragePath(monthStr: string, createdAt: Date) {
  const stamp = createdAt.toISOString().replace(/[-:.]/g, '');
  return `${monthStr}/attendance-report-${monthStr}-${stamp}.xlsx`;
}

export function decideMonthExport(liveCheckinCount: number, archiveExists: boolean): ExportDecision {
  if (liveCheckinCount > 0) return { kind: 'live' };
  if (archiveExists) return { kind: 'archive' };
  return { kind: 'none' };
}
