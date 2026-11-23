import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { createRunner } from '../src/runs.js';
import { actorOf, createRunLog, decisionLine, runRecord } from '../src/runObs.js';
import { assertRunObservability, classify } from '../src/runObservability.js';

// Rule 27 for worker-demo: the lab's own record of each run. The Privilege demo is faked in-process (loopback-free): a mint, the MCP door and the approvals API.
const jwt = (c) => `h.${Buffer.from(JSON.stringify(c)).toString('base64url')}.s`;
const HOLD = 'backlog.update_story';
const clockFrom = () => { let t = 0; return () => new Date(Date.UTC(2026, 10, 23, 10, 0, 0) + (t++) * 1000); };

function door({ down = false, approvalsDown = false } = {}) {
  return async (url, init) => {
    const u = String(url);
    const b = JSON.parse(init.body || '{}');
    if (u.endsWith('/mint')) return { ok: true, status: 200, json: async () => ({ access_token: jwt({ sub: b.agent ?? b.persona, exp: 9999999999, ...(b.act ? { act: { sub: b.act } } : {}) }) }) };
    if (down) throw new Error('connect ECONNREFUSED 127.0.0.1:4510');
    if (approvalsDown && u.includes('/api/approvals/')) throw new Error('connect ECONNREFUSED 127.0.0.1:4510');
    const m = u.match(/\/api\/approvals\/([\w-]+)\/(approve|deny)$/);
    if (m) return { ok: true, status: 200, json: async () => ({ id: m[1], outcome: { decision: m[2] === 'approve' ? 'allow' : 'deny', executed: m[2] === 'approve', rule: 'hold' } }) };
    const t = b.params.name;
    const reply = t === 'github.merge_pr' ? { error: { code: -32003, message: 'denied by policy', data: { rule: 'forbid-merge', reason: 'no merge authority' } } }
      : t === HOLD ? { error: { code: -32004, message: 'held for approval', data: { rule: 'hold-update', approvalId: 'A1', approvers: ['priya'] } } }
        : { result: { content: [{ type: 'text', text: '{"ok":true}' }] } };
    return { status: 200, headers: { get: () => null }, json: async () => ({ jsonrpc: '2.0', id: b.id, ...reply }) };
  };
}

function runner({ mode = 'local', fetchImpl = door(), write = () => {} } = {}) {
  const cfg = config(mode === 'mock' ? { MODE: 'mock' } : {});
  return createRunner({ cfg, fetchImpl, now: clockFrom(), log: createRunLog({ write }) });
}

describe('stdout lines are read by no shared matcher', () => {
  it('every line kind and cause passes the shared classify() and holds no matcher word', () => {
    const causes = ['policy-allow', 'policy-deny', 'held', 'credential-check', 'door-unreadable', 'ran-on-approval', 'approved', 'approval-declined',
      'answer-not-accepted', 'no-person', 'roster-name', 'pi-flow-sign-in', 'agent-call'];
    const lines = causes.map((cause, i) => decisionLine({ at: '2026-11-23T10:00:00.000Z', layer: 'privilege', who: 'eli', outcome: 'info', cause, step: i + 1 }, 'a1b2c3d4-0000-4000-8000-00000000000a'));
    lines.push(decisionLine({ at: '2026-11-23T10:00:00.000Z', layer: 'privilege', who: 'eli', noReply: true, cause: 'no-reply', step: 9 }, 'run-1'));
    for (const l of lines) {
      expect(classify(l)).toBeNull();
      expect(l).not.toMatch(/refused|denied|rejected|forbidden|failed|invalid|expired|mismatch|token|audience|scope|served/i);
    }
  });

  it('a typed name the lab does not know is written as other, and its text never reaches a line', () => {
    expect(actorOf('token-thief', ['eli', 'delivery-agent'])).toBe('other');
    expect(actorOf('eli', ['eli', 'delivery-agent'])).toBe('eli');
  });

  it('a roster name with a space and an equals sign is sanitised on the actor field, so it cannot add a second key=value pair', () => {
    const unsafe = 'eli result=passed x';
    const line = decisionLine({ at: '2026-11-23T10:00:00.000Z', layer: 'privilege', who: unsafe, outcome: 'info', cause: 'approved', step: 1 }, 'run-1');
    expect(line).toMatch(/^\S+ worker-demo decision step=1 layer=privilege actor=\S+ result=unclear cause=approved run=run-1$/);
    expect(line.split(' result=')).toHaveLength(2);
    expect(classify(line)).toBeNull();
  });

  it('a configured persona with unsafe characters is written as a sanitised actor on every line of a run', async () => {
    const out = [];
    const r = createRunner({ cfg: config({ PERSONAS: 'eli,ada x=1' }), fetchImpl: door(), now: clockFrom(), log: createRunLog({ write: (l) => out.push(l) }) });
    await r.start({ scenario: 'code-review', persona: 'ada x=1' });
    expect(out.length).toBeGreaterThan(0);
    for (const l of out) {
      expect(l).toMatch(/ actor=\S+ result=\S+ cause=\S+ run=\S+$/);
      expect(l.split(' result=')).toHaveLength(2);
      expect(classify(l)).toBeNull();
    }
  });
});

describe('the record of one run', () => {
  it('a Mock run holds only simulated rows, one stdout line per event, and states what Authorize and the gateway did not do', async () => {
    const out = [];
    const r = runner({ mode: 'mock', write: (l) => out.push(l) });
    const run = await r.start({ scenario: 'code-review', persona: 'eli' });
    const rec = await runRecord(run, { clock: Date.now });
    expect(assertRunObservability(rec)).toEqual([]);
    const rows = rec.rows.filter((x) => x.at !== null);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => x.origin === 'simulated')).toBe(true);
    expect(rec.coverage.authorize).toBe('not-logged');
    expect(rec.reasons.authorize).toMatch(/PingOne Authorize/);
    expect(rec.summary.allowed).toBeGreaterThan(0);
    expect(rec.summary.refused).toBeGreaterThan(0);
    expect(out.length).toBe(run.obs.events.length);
    expect(out.every((l) => / worker-demo decision step=\S+ layer=\S+ actor=\S+ result=\S+ cause=\S+ run=\S+$/.test(l))).toBe(true);
  });

  it('a Real run holds response rows only, and never a logged one', async () => {
    const r = runner({ mode: 'local' });
    const run = await r.start({ scenario: 'code-review', persona: 'eli' });
    const rec = await runRecord(run, { clock: Date.now });
    expect(assertRunObservability(rec)).toEqual([]);
    const rows = rec.rows.filter((x) => x.at !== null);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => x.origin === 'response')).toBe(true);
  });

  it('a held call waits, then an approval adds information rows and the run-once row', async () => {
    const r = runner({ mode: 'local' });
    const run = await r.start({ scenario: 'sprint-planning', persona: 'ben' });
    expect(run.status).toBe('parked');
    const done = await r.resolve(run.id, { decision: 'approve', approver: 'priya' });
    const causes = done.obs.events.map((e) => e.cause);
    expect(causes).toEqual(expect.arrayContaining(['held', 'approved', 'ran-on-approval']));
    const rec = await runRecord(done, { clock: Date.now });
    expect(assertRunObservability(rec)).toEqual([]);
    const approvals = rec.rows.filter((x) => x.detail?.cause === 'approved' || x.detail?.cause === 'ran-on-approval');
    expect(approvals).toHaveLength(2);
    expect(approvals.every((x) => x.outcome === 'info')).toBe(true);
  });

  it('a call that got no reply has no row, a no-reply line, and a record that says it is partial', async () => {
    const out = [];
    const r = runner({ mode: 'local', fetchImpl: door({ down: true }), write: (l) => out.push(l) });
    const run = await r.start({ scenario: 'code-review', persona: 'eli' });
    expect(run.status).toBe('failed');
    expect(run.steps[0].reason).toMatch(/did not answer/);
    const rec = await runRecord(run, { clock: Date.now });
    expect(assertRunObservability(rec)).toEqual([]);
    expect(rec.rows.filter((x) => x.layer === 'privilege' && x.at !== null)).toHaveLength(0);
    expect(rec.reasons.privilege).toMatch(/partial/);
    expect(out.some((l) => /result=no-reply/.test(l))).toBe(true);
  });

  it('an approval answer that got no reply is a no-reply line, not an information row, and the record is partial', async () => {
    const out = [];
    const r = runner({ mode: 'local', fetchImpl: door({ approvalsDown: true }), write: (l) => out.push(l) });
    const run = await r.start({ scenario: 'sprint-planning', persona: 'ben' });
    expect(run.status).toBe('parked');
    await expect(r.resolve(run.id, { decision: 'approve', approver: 'priya' })).rejects.toMatchObject({ code: 'pep_down' });
    expect(run.obs.noReplies).toBe(1);
    const rec = await runRecord(run, { clock: Date.now });
    expect(assertRunObservability(rec)).toEqual([]);
    expect(rec.reasons.privilege).toMatch(/partial/);
    expect(rec.rows.filter((x) => x.detail?.cause === 'answer-not-accepted' || x.detail?.cause === 'no-reply')).toHaveLength(0);
    expect(out.filter((l) => /result=no-reply/.test(l))).toHaveLength(1);
    expect(out.at(-1)).toMatch(/ layer=privilege actor=priya result=no-reply cause=no-reply run=/);
  });

  it('a throwing writer changes neither the run nor its record, and names only the error code', async () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const healthy = runner({ mode: 'mock' });
      const a = await healthy.start({ scenario: 'code-review', persona: 'eli' });
      let n = 0;
      const broken = runner({ mode: 'mock', write: () => { if (++n === 3) { const e = new Error('disk full: secret abc'); e.code = 'EIO'; throw e; } } });
      const b = await broken.start({ scenario: 'code-review', persona: 'eli' });
      expect(b.steps.map((s) => [s.tool, s.outcome, s.asDesigned])).toEqual(a.steps.map((s) => [s.tool, s.outcome, s.asDesigned]));
      expect(b.obs.events.map((e) => [e.layer, e.cause])).toEqual(a.obs.events.map((e) => [e.layer, e.cause]));
      const text = err.mock.calls.map((c) => String(c[0])).join('');
      expect(text).toMatch(/EIO/);
      expect(text).not.toMatch(/disk full|secret abc/);
    } finally { err.mockRestore(); }
  });
});

describe('GET /api/run-observability', () => {
  it('answers one run in its own mode, refuses other methods with Allow, and rejects a bad or unknown run id', async () => {
    const app = createApp({ cfg: config({}), fetchImpl: door(), now: clockFrom() });
    const made = await request(app).post('/api/runs').send({ scenario: 'code-review', persona: 'eli' });
    expect(made.status).toBe(201);
    expect(made.body.obs).toBeUndefined();
    const ok = await request(app).get(`/api/run-observability?runId=${made.body.id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.record.source).toBe('real');
    expect(ok.headers['cache-control']).toBe('no-store');
    const post = await request(app).post(`/api/run-observability?runId=${made.body.id}`).send({});
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe('GET');
    expect((await request(app).get('/api/run-observability')).status).toBe(400);
    expect((await request(app).get('/api/run-observability?runId=../etc')).status).toBe(400);
    expect((await request(app).get('/api/run-observability?runId=00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});
