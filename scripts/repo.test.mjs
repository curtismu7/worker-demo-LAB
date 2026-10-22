import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

test('the shelf entry composeFile is relative (portable, not the author\'s machine)', () => {
  const entry = JSON.parse(fs.readFileSync(new URL('../docs/shelf-entry.json', import.meta.url), 'utf8')).demos[0];
  assert.ok(!path.isAbsolute(entry.composeFile), `composeFile ${entry.composeFile} must be relative`);
  assert.ok(fs.existsSync(new URL(`../${entry.composeFile}`, import.meta.url)), 'composeFile must exist in the repo');
});

test('ci runs the doctor without the Privilege demo (CI has no such stack)', () => {
  const ci = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /npm run doctor -- --skip-pep/);
});
