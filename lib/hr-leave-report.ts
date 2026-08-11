import type { HrLeaveRequest } from './attendance-report-excel';

type HrLeaveReportEnv = {
  HR_LEAVE_REPORT_URL?: string;
  HR_LEAVE_REPORT_SECRET?: string;
};

type HrLeaveReportResponse = {
  leaves?: unknown;
};

type Fetcher = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

export function buildHrLeaveReportUrl(baseUrl: string | undefined, monthStr: string, secret: string | undefined) {
  const cleanBaseUrl = String(baseUrl || '').trim();
  const cleanSecret = String(secret || '').trim();
  if (!cleanBaseUrl || !cleanSecret) return null;

  const url = new URL(cleanBaseUrl);
  url.searchParams.set('api', 'approvedLeaves');
  url.searchParams.set('month', monthStr);
  url.searchParams.set('secret', cleanSecret);
  return url.toString();
}

export function normalizeHrLeaveApiResponse(payload: HrLeaveReportResponse): HrLeaveRequest[] {
  const rawLeaves = Array.isArray(payload?.leaves) ? payload.leaves : [];

  return rawLeaves
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        empId: String(item.empId || '').trim(),
        type: String(item.type || '').trim(),
        start: String(item.start || '').trim(),
        end: String(item.end || '').trim(),
        status: String(item.status || '').trim(),
      };
    })
    .filter((row) => row.empId && row.type && row.start && row.end);
}

export async function fetchHrApprovedLeaves(
  monthStr: string,
  options: { env?: HrLeaveReportEnv; fetcher?: Fetcher } = {},
): Promise<HrLeaveRequest[]> {
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const url = buildHrLeaveReportUrl(env.HR_LEAVE_REPORT_URL, monthStr, env.HR_LEAVE_REPORT_SECRET);
  if (!url) return [];

  try {
    const response = await fetcher(url, { cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json();
    return normalizeHrLeaveApiResponse(payload as HrLeaveReportResponse);
  } catch {
    return [];
  }
}
