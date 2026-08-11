import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const sourcePath = join(process.cwd(), 'lib', 'device-access.ts');
const source = await readFile(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
});

const tempDir = await mkdtemp(join(tmpdir(), 'device-access-'));
const tempModule = join(tempDir, 'device-access.mjs');
await writeFile(tempModule, outputText, 'utf8');

const access = await import(pathToFileURL(tempModule).href);

assert.deepEqual(access.resolveDeviceAccess(null, null, null), {
  status: 'checking',
  blocked: true,
});
assert.deepEqual(access.resolveDeviceAccess('admin', null, null), {
  status: 'allowed',
  blocked: false,
});
assert.deepEqual(access.resolveDeviceAccess('staff', null, 'current-device'), {
  status: 'unbound',
  blocked: true,
});
assert.deepEqual(access.resolveDeviceAccess('staff', 'bound-device', null), {
  status: 'checking',
  blocked: true,
});
assert.deepEqual(access.resolveDeviceAccess('staff', 'bound-device', 'other-device'), {
  status: 'mismatch',
  blocked: true,
});
assert.deepEqual(access.resolveDeviceAccess('staff', 'bound-device', 'bound-device'), {
  status: 'allowed',
  blocked: false,
});

assert.deepEqual(access.getDeviceAccessNotice('mismatch'), {
  title: 'บัญชีนี้ไม่ตรงกับเครื่องที่ใช้งาน',
  message: 'กรุณาส่งคำขอเปลี่ยนเครื่องและรอผู้ดูแลระบบอนุมัติก่อนลงเวลา',
  actionLabel: 'ไปหน้าขอเปลี่ยนเครื่อง',
  actionHref: '/account/device',
});

const checkinPage = await readFile(join(process.cwd(), 'app', 'checkin', 'page.tsx'), 'utf8');
const checkinClient = await readFile(join(process.cwd(), 'app', 'checkin', 'CheckinClient.tsx'), 'utf8');
const offsitePage = await readFile(join(process.cwd(), 'app', 'offsite', 'page.tsx'), 'utf8');

assert.match(checkinPage, /boundDeviceId=\{emp\.device_id\}/, 'checkin page should pass the bound device id to the client');
assert.match(checkinClient, /resolveDeviceAccess\(role,\s*boundDeviceId,\s*deviceId\)/, 'checkin UI should derive device access from the browser device');
assert.match(checkinClient, /disabled=\{pending \|\| !coords \|\| !inRange \|\| deviceBlocked\}/, 'round check-in buttons should be disabled on device mismatch');
assert.match(checkinClient, /deviceBlocked \? \(/, 'off-site card on checkin page should render a disabled state on device mismatch');
assert.match(offsitePage, /\.select\('emp_id, role, device_id'\)/, 'offsite page should load employee device info before allowing submit');
assert.match(offsitePage, /resolveDeviceAccess\(role,\s*boundDeviceId,\s*deviceId\)/, 'offsite UI should derive device access from the browser device');
assert.match(offsitePage, /disabled=\{pending \|\| !photo \|\| !coords \|\| !location \|\| deviceBlocked\}/, 'offsite submit should be disabled on device mismatch');

console.log('device access tests passed');
