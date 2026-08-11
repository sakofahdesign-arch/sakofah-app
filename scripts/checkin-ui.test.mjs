import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const sourcePath = join(process.cwd(), 'lib', 'checkin-ui.ts');
const source = await readFile(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
});

const tempDir = await mkdtemp(join(tmpdir(), 'checkin-ui-'));
const tempModule = join(tempDir, 'checkin-ui.mjs');
await writeFile(tempModule, outputText, 'utf8');

const ui = await import(pathToFileURL(tempModule).href);

assert.equal(ui.checkinDialogTitle('in'), 'Check-in');
assert.equal(ui.checkinDialogTitle('out'), 'Check-out');
assert.equal(ui.checkinDialogTitle('offsite_in'), 'Check-in');
assert.equal(ui.checkinDialogTitle('offsite_out'), 'Check-out');
assert.equal(ui.checkinDialogMessage(), 'เรียบร้อย');
assert.equal(ui.formatTimingMs(950), '0.95s');
assert.equal(ui.formatTimingMs(1530), '1.53s');

console.log('checkin-ui tests passed');
