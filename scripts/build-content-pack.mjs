// Builds content-pack.json for the Learning Hub from the scenario data, so the pack cannot drift from the scenarios.
//   node scripts/build-content-pack.mjs        (writes content-pack.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from '../server/src/scenarios.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

export function buildPack() {
  const list = Object.values(SCENARIOS);
  const storyId = (s) => `S${String(list.indexOf(s) + 1).padStart(2, '0')}`; // the hub wants S01, S02, ...
  return {
    schema: 'demo-content-pack/1',
    id: 'worker-demo',
    title: 'Worker Agent Demo',
    version,
    demo: { id: 'worker-demo', name: 'Worker Agent Demo', catalog: 'D22', baseUrl: 'http://127.0.0.1:6700', doctor: '/api/health', tags: ['worker-agent', 'delegation', 'unattended', 'policy-enforcement', 'mock'] },
    glossary: [
      { id: 'worker-agent', term: 'Worker agent', definition: 'An agent that acts for a signed-in person. The token has sub = the person and act = the agent, so both are in the audit trail.' },
      { id: 'act-claim', term: 'act claim', definition: 'The RFC 8693 actor claim: who is acting on the subject\'s behalf. Each delegated hop here gets its own token with its own act and a narrower scope.', aliases: ['actor claim'] },
      { id: 'pep', term: 'Policy enforcement point', definition: 'Every tool call goes through one point that allows it, denies it, or holds it for a person to approve. Here that is the Privilege demo.', aliases: ['PEP'] },
      { id: 'unattended', term: 'Unattended run', definition: 'A run that starts with no person in the session. It only runs while armed (an hour), and a write above its remit parks for a human.' },
      { id: 'kill-switch', term: 'Kill switch', definition: 'Disarms the unattended lane and cancels every run still waiting on a person, so nothing resumes later.' },
    ],
    sources: [
      { id: 'rfc8693', title: 'RFC 8693: OAuth 2.0 Token Exchange', url: 'https://www.rfc-editor.org/rfc/rfc8693', kind: 'standard', use: 'The act (actor) claim and delegation semantics', status: 'not-read', checked: '2026-10-21' },
    ],
    stories: list.map((s) => ({ id: storyId(s), title: s.title, say: s.blurb })),
    cards: list.map((s) => ({
      id: `try-${s.id}`, label: s.title, description: s.blurb, group: 'try-it',
      action: { type: 'route', href: `/#scenario-${s.id}` }, story: storyId(s), terms: s.lane === 'unattended' ? ['unattended', 'kill-switch'] : s.lane === 'delegated' ? ['act-claim', 'pep'] : ['worker-agent', 'pep'],
    })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'content-pack.json'), `${JSON.stringify(buildPack(), null, 2)}\n`);
  console.log('wrote content-pack.json');
}
