export type CheckinActionType = 'in' | 'out' | 'offsite_in' | 'offsite_out';

export function checkinDialogTitle(type: CheckinActionType) {
  return type === 'out' || type === 'offsite_out' ? 'Check-out' : 'Check-in';
}

export function checkinDialogMessage() {
  return 'เรียบร้อย';
}

export function formatTimingMs(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}
