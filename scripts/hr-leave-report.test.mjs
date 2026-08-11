import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const sourcePath = join(process.cwd(), 'lib', 'hr-leave-report.ts');
const source = await readFile(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
});

const tempDir = await mkdtemp(join(tmpdir(), 'hr-leave-report-'));
const tempModule = join(tempDir, 'hr-leave-report.mjs');
await writeFile(tempModule, outputText, 'utf8');

const { buildHrLeaveReportUrl, normalizeHrLeaveApiResponse, fetchHrApprovedLeaves } = await import(pathToFileURL(tempModule).href);

assert.equal(
  buildHrLeaveReportUrl('https://script.google.com/macros/s/demo/exec', '2026-07', 'top-secret'),
  'https://script.google.com/macros/s/demo/exec?api=approvedLeaves&month=2026-07&secret=top-secret',
  'builds the HR leave report URL with the approved leaves API, month, and secret',
);

assert.equal(
  buildHrLeaveReportUrl('', '2026-07', 'top-secret'),
  null,
  'does not build a HR leave report URL when the base URL is missing',
);

assert.deepEqual(
  normalizeHrLeaveApiResponse({
    leaves: [
      { empId: ' E001 ', name: 'A', type: 'ลาป่วย', start: '10/07/2026', end: '10/07/2026', status: 'Approved' },
      { empId: '', name: 'B', type: 'ลากิจ', start: '11/07/2026', end: '11/07/2026', status: 'Approved' },
      { empId: 'E002', name: 'C', type: '', start: '12/07/2026', end: '12/07/2026', status: 'Approved' },
    ],
  }),
  [{ empId: 'E001', type: 'ลาป่วย', start: '10/07/2026', end: '10/07/2026', status: 'Approved' }],
  'normalizes HR API leaves and drops rows missing the employee ID or leave type',
);

const requestedUrls = [];
const leaves = await fetchHrApprovedLeaves('2026-07', {
  env: {
    HR_LEAVE_REPORT_URL: 'https://script.google.com/macros/s/demo/exec',
    HR_LEAVE_REPORT_SECRET: 'top-secret',
  },
  fetcher: async (url) => {
    requestedUrls.push(url);
    return {
      ok: true,
      json: async () => ({
        leaves: [{ empId: 'E003', type: 'ลาพักผ่อน', start: '20/07/2026', end: '21/07/2026', status: 'Approved' }],
      }),
    };
  },
});

assert.deepEqual(
  leaves,
  [{ empId: 'E003', type: 'ลาพักผ่อน', start: '20/07/2026', end: '21/07/2026', status: 'Approved' }],
  'fetches and normalizes approved leaves from the HR report API',
);
assert.equal(
  requestedUrls[0],
  'https://script.google.com/macros/s/demo/exec?api=approvedLeaves&month=2026-07&secret=top-secret',
  'fetches the month-scoped HR API URL with the configured secret',
);

console.log('hr leave report tests passed');
