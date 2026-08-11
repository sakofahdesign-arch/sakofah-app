import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const source = await readFile(join(process.cwd(), 'app', 'admin', 'AdminClient.tsx'), 'utf8');

assert.match(
  source,
  /const modalDateFieldStyle: React\.CSSProperties = \{[\s\S]*overflow: 'hidden'/,
  'cleanup date fields should be wrapped in a clipped field container',
);
assert.match(
  source,
  /const modalDateInputStyle: React\.CSSProperties = \{[\s\S]*WebkitAppearance: 'none'/,
  'cleanup date inputs should opt out of iOS native intrinsic sizing',
);
assert.match(
  source,
  /const modalDateInputStyle: React\.CSSProperties = \{[\s\S]*minInlineSize: 0/,
  'cleanup date inputs should allow shrinking inside the mobile modal',
);
assert.equal(
  (source.match(/style=\{modalDateFieldStyle\}/g) ?? []).length,
  2,
  'both cleanup date inputs should use the clipped field container',
);
assert.equal(
  (source.match(/style=\{modalDateInputStyle\}/g) ?? []).length,
  2,
  'both cleanup date inputs should use the iOS-safe input style',
);

console.log('admin cleanup modal layout tests passed');
