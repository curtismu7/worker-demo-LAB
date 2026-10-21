import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { buildPack } from './build-content-pack.mjs';
import { validatePack } from './validate-content-pack.mjs';
import { SCENARIOS } from '../server/src/scenarios.js';

test('the content pack validates against the hub schema', () => {
  assert.deepEqual(validatePack(buildPack()), []);
});

test('the committed content-pack.json is up to date with the scenarios', () => {
  const committed = JSON.parse(fs.readFileSync(new URL('../content-pack.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(buildPack())), 'run: npm run pack');
});

test('every scenario has a talk track entry in docs/talk-track.md and a story', () => {
  const doc = fs.readFileSync(new URL('../docs/talk-track.md', import.meta.url), 'utf8');
  for (const s of Object.values(SCENARIOS)) {
    assert.ok(doc.includes(`\`${s.id}\``), `docs/talk-track.md must mention ${s.id}`);
    assert.ok(Array.isArray(s.talk) && s.talk.length >= 3, `${s.id} needs at least 3 talk points`);
    assert.ok(typeof s.prompt === 'string' && s.prompt.length > 10, `${s.id} needs a prompt`);
  }
});
