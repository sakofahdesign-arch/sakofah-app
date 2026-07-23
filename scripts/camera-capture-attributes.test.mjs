import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const cameraFiles = [
  join('app', 'offsite', 'page.tsx'),
  join('app', 'account', 'device', 'bind', 'DeviceBindClient.tsx'),
];

for (const file of cameraFiles) {
  const source = await readFile(join(process.cwd(), file), 'utf8');

  assert.equal(
    source.includes('accept="image/*;capture=camera"'),
    false,
    `${file} should not use legacy capture syntax inside accept`,
  );
  assert.match(
    source,
    /accept="image\/\*"\s+capture="environment"/,
    `${file} should declare image accept and environment capture separately`,
  );
}

console.log('camera capture attribute tests passed');
