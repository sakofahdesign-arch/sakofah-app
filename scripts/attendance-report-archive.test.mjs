import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const sourcePath = join(process.cwd(), 'lib', 'attendance-report-archive.ts');
const source = await readFile(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
});

const tempDir = await mkdtemp(join(tmpdir(), 'attendance-report-archive-'));
const tempModule = join(tempDir, 'attendance-report-archive.mjs');
await writeFile(tempModule, outputText, 'utf8');

const archive = await import(pathToFileURL(tempModule).href);

assert.equal(archive.ATTENDANCE_ARCHIVE_BUCKET, 'attendance-report-archives');

assert.deepEqual(
  archive.validateSingleMonthDateRange('2026-07-01', '2026-07-31'),
  {
    ok: true,
    monthStr: '2026-07',
    startIso: '2026-07-01T00:00:00.000+07:00',
    endExclusiveIso: '2026-08-01T00:00:00.000+07:00',
  },
);

assert.equal(
  archive.validateSingleMonthDateRange('2026-07-31', '2026-08-01').error,
  'กรุณาเลือกช่วงวันที่ให้อยู่ในเดือนเดียวกัน',
);

assert.equal(
  archive.validateSingleMonthDateRange('2026-07-10', '2026-07-09').error,
  'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น',
);

assert.equal(
  archive.validateSingleMonthDateRange('', '2026-07-31').error,
  'กรุณาเลือกวันที่ให้ครบ',
);

assert.equal(archive.monthKeyFromDateRange('2026-07-01', '2026-07-31'), '2026-07');

assert.equal(
  archive.makeArchiveStoragePath('2026-07', new Date('2026-08-01T02:03:04.000Z')),
  '2026-07/attendance-report-2026-07-20260801T020304000Z.xlsx',
);

assert.deepEqual(archive.decideMonthExport(5, false), { kind: 'live' });
assert.deepEqual(archive.decideMonthExport(1, true), { kind: 'live' });
assert.deepEqual(archive.decideMonthExport(0, true), { kind: 'archive' });
assert.deepEqual(archive.decideMonthExport(0, false), { kind: 'none' });

async function runArchiveThenDelete({ archiveOk }) {
  const calls = [];
  const archiveReport = async () => {
    calls.push('archive');
    return archiveOk ? { ok: true } : { error: 'archive failed' };
  };
  const removePhotos = async () => calls.push('removePhotos');
  const deleteRows = async () => calls.push('deleteRows');

  const archiveResult = await archiveReport();
  if (archiveResult.error) return { calls, result: archiveResult };
  await removePhotos();
  await deleteRows();
  return { calls, result: { ok: true } };
}

assert.deepEqual((await runArchiveThenDelete({ archiveOk: true })).calls, ['archive', 'removePhotos', 'deleteRows']);
assert.deepEqual((await runArchiveThenDelete({ archiveOk: false })).calls, ['archive']);

console.log('attendance-report-archive tests passed');
