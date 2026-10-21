#!/usr/bin/env node
// Drives every scenario through a RUNNING worker-demo and fails on anything the scenario did not expect. Run it against the real
// Privilege demo (utility pack), not a fake: that is the point. Needs the stack up: see README.
//   BASE_URL=http://127.0.0.1:6700 node scripts/smoke.mjs
// Loopback only. Approves holds as `priya`, checks nobody can approve their own call, then proves the kill switch.
import { isLoopbackHost } from '../server/src/safety.js';

const base = new URL(process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 6700}`);
if (!isLoopbackHost(base.hostname)) { console.error(`refusing ${base.hostname}: loopback only`); process.exit(2); }
const api = async (path, body) => {
  const r = await fetch(new URL(path, base), body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', origin: base.origin }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

let failed = 0;
const check = (ok, name, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const steps = (run) => run.steps.map((s) => `${s.tool}:${s.outcome}`).join(' ');

await api('/api/reset', {});
const { body: { scenarios } } = await api('/api/scenarios');
await api('/api/arm', { armed: true });

for (const sc of scenarios) {
  const r = await api('/api/runs', { scenario: sc.id, persona: sc.persona });
  if (r.status !== 201) { check(false, `${sc.id}: starts`, `${r.status} ${r.body.error ?? ''} ${r.body.reason ?? ''}`); continue; }
  let run = r.body;
  if (run.status === 'parked') {
    const self = await api(`/api/runs/${run.id}/resolve`, { decision: 'approve', approver: sc.persona });
    check(self.status === 403, `${sc.id}: the person who asked cannot approve their own call`, `HTTP ${self.status}`);
    const ok = await api(`/api/runs/${run.id}/resolve`, { decision: 'approve', approver: 'priya' });
    check(ok.status === 200, `${sc.id}: priya approves with a Bearer token`, `HTTP ${ok.status} ${ok.body.reason ?? ''}`);
    run = ok.body.steps ? ok.body : run;
    check(run.steps.some((s) => s.ranOnApproval && s.outcome === 'allow'), `${sc.id}: the policy point ran the held call once`);
  }
  const surprises = run.steps.filter((s) => !s.asDesigned);
  check(run.status === 'done' && surprises.length === 0, `${sc.id}: ${run.status}, every step as designed`, surprises.length ? surprises.map((s) => `${s.tool} expected ${s.expected} got ${s.outcome} (${s.rule})`).join('; ') : steps(run));
}

// Deny of a held call: nothing runs.
const d = await api('/api/runs', { scenario: 'sprint-planning', persona: 'ben' });
const denied = await api(`/api/runs/${d.body.id}/resolve`, { decision: 'deny', approver: 'priya' });
check(denied.body.status === 'denied' && !denied.body.steps.some((s) => s.ranOnApproval), 'a denied approval runs nothing');

// Kill switch: a parked unattended run is cancelled and the lane is disarmed.
await api('/api/arm', { armed: true });
const p = await api('/api/runs', { scenario: 'evidence-sweep', persona: 'gwen' });
const k = await api('/api/kill', {});
check(p.body.status === 'parked' && k.body.cancelled >= 1 && k.body.armed === false, 'the kill switch cancels a parked run and disarms');
check((await api('/api/runs', { scenario: 'evidence-sweep', persona: 'gwen' })).status === 403, 'a disarmed lane refuses to run');

await api('/api/reset', {});
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
