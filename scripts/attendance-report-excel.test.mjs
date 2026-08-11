import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import XLSX from 'xlsx-js-style';

const sourcePath = join(process.cwd(), 'lib', 'attendance-report-excel.ts');
const source = await readFile(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
});

const tempDir = await mkdtemp(join(tmpdir(), 'attendance-report-excel-'));
const tempModule = join(tempDir, 'attendance-report-excel.mjs');
await writeFile(tempModule, outputText, 'utf8');

const {
  getAttendanceDayWarning,
  getEmployeeDayCellStyle,
  EMPLOYEE_DAY_WARNING_FILL,
  EMPLOYEE_DAY_LEAVE_FILL,
  getEmployeeLeaveCellStyle,
  buildApprovedLeaveDayMap,
} = await import(pathToFileURL(tempModule).href);

const workStart = 8 * 60 + 20;
const tolerance = 5;
const workEnd = 16 * 60 + 30;

assert.equal(
  getAttendanceDayWarning({ inMinutes: 8 * 60 + 26, outMinutes: 16 * 60 + 45, workStart, tolerance, workEnd }),
  true,
  'marks the whole day as warning when check-in is later than start plus tolerance',
);

assert.equal(
  getAttendanceDayWarning({ inMinutes: 8 * 60 + 20, outMinutes: 16 * 60 + 10, workStart, tolerance, workEnd }),
  true,
  'marks the whole day as warning when check-out is earlier than work end',
);

assert.equal(
  getAttendanceDayWarning({ inMinutes: 8 * 60 + 25, outMinutes: 16 * 60 + 30, workStart, tolerance, workEnd }),
  false,
  'does not mark warning when check-in is within tolerance and check-out is on time',
);

assert.deepEqual(
  getEmployeeDayCellStyle(true).fill.fgColor.rgb,
  EMPLOYEE_DAY_WARNING_FILL,
  'warning day style uses the light red fill exported for the employee report',
);

const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.aoa_to_sheet([['เข้า']]);
worksheet.A1.s = getEmployeeDayCellStyle(true);
XLSX.utils.book_append_sheet(workbook, worksheet, 'รายพนักงาน');
const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
assert.match(
  buffer.toString('latin1'),
  new RegExp(EMPLOYEE_DAY_WARNING_FILL, 'i'),
  'written xlsx file contains the warning fill color',
);

assert.deepEqual(
  getEmployeeLeaveCellStyle().fill.fgColor.rgb,
  EMPLOYEE_DAY_LEAVE_FILL,
  'HR leave day style uses the leave fill exported for the employee report',
);

const leaveDayMap = buildApprovedLeaveDayMap(
  [
    { empId: 'E001', type: 'ลาป่วย', start: '10/07/2026', end: '10/07/2026', status: 'Approved' },
    { empId: 'E001', type: 'ลากิจ', start: '12/07/2026', end: '14/07/2026', status: 'Approved' },
    { empId: 'E002', type: 'ลาพักผ่อน', start: '30/06/2026', end: '02/07/2026', status: 'Approved' },
    { empId: 'E001', type: 'ลาคลอด', start: '20/07/2026', end: '20/07/2026', status: 'Pending' },
  ],
  2026,
  7,
);

assert.equal(
  leaveDayMap.get('E001|10'),
  'ลาป่วย',
  'maps an approved one-day HR leave to the matching employee/day cell',
);

assert.equal(
  leaveDayMap.get('E001|13'),
  'ลากิจ',
  'expands an approved multi-day HR leave across every day in the report month',
);

assert.equal(
  leaveDayMap.get('E002|1'),
  'ลาพักผ่อน',
  'keeps the in-month portion when an approved HR leave starts before the report month',
);

assert.equal(
  leaveDayMap.has('E001|20'),
  false,
  'ignores HR leave requests that are not finally approved',
);

console.log('attendance report excel tests passed');
