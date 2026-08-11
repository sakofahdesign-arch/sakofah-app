import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const sourcePath = join(process.cwd(), 'lib', 'offsite-photo.ts');
const source = await readFile(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
});

const tempDir = await mkdtemp(join(tmpdir(), 'offsite-photo-'));
const tempModule = join(tempDir, 'offsite-photo.mjs');
await writeFile(tempModule, outputText, 'utf8');

const photo = await import(pathToFileURL(tempModule).href);

assert.equal(photo.OFFSITE_PHOTO_MAX_WIDTH, 960);
assert.equal(photo.OFFSITE_PHOTO_QUALITY, 0.68);
assert.deepEqual(photo.fitImageDimensions(1920, 1080), { width: 960, height: 540 });
assert.deepEqual(photo.fitImageDimensions(640, 480), { width: 640, height: 480 });
assert.deepEqual(photo.fitImageDimensions(0, 0), { width: 960, height: 720 });

console.log('offsite-photo tests passed');
