import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';

const jwt = (c) => `h.${Buffer.from(JSON.stringify(c)).toString('base64url')}.s`;
const TOKEN = jwt({ sub: 'priya', groups: ['governance-reviewers'], aud: 'pep', exp: 9999999999, act: { sub: 'worker-agent' } });

// Fake Privilege demo: decides by tool name the way the shipped policies are specced.
function fakeFetch({ down = false } = {}) {
  const seen = [];
  const fn = async (url, init) => {
    if (down) throw new Error('ECONNREFUSED');
    const b = JSON.parse(init.body);
    if (url.endsWith('/mint')) return { ok: true, status: 200, json: async () => ({ access_token: TOKEN }) };
    seen.push({ auth: init.headers.authorization, name: b.params.name });
    const t = b.params.name;
    const reply = t === 'github.merge_pr' ? { error: { code: -32003, message: 'denied by policy', data: { rule: 'forbid-merge', reason: 'no merge authority' } } }
      : (t === 'backlog.update_story' || t === 'confluence.update_requirement') ? { error: { code: -32004, message: 'held for approval', data: { rule: 'hold-update', approvalId: 'A1', approvers: ['priya'] } } }
        : { result: { content: [{ type: 'text', text: JSON.stringify({ ok: t }) }] } };
    return { status: 200, headers: { get: () => '00-trace-span-01' }, json: async () => ({ jsonrpc: '2.0', id: b.id, ...reply }) };
  };
  fn.seen = seen;
  return fn;
}
// Records the (act, scope) each mint asked for, to prove every delegated hop gets its own narrower token.
function mintLog() {
  const mints = [];
  const base = fakeFetch();
  const fn = async (url, init) => { if (url.endsWith('/mint')) mints.push(JSON.parse(init.body)); return base(url, init); };
  fn.mints = mints;
  return fn;
}
const app = (f) => createApp({ cfg: config({}), fetchImpl: f });

describe('runs', () => {
  it('attended code review: reads allowed, merge denied, run finishes as designed', async () => {
    const f = fakeFetch();
    const res = await request(app(f)).post('/api/runs').send({ scenario: 'code-review', persona: 'priya' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('done');
    expect(res.body.steps.map((s) => s.outcome)).toEqual(['allow', 'allow', 'allow', 'deny']);
    expect(res.body.steps.every((s) => s.asDesigned)).toBe(true);
    expect(res.body.steps[3].rule).toBe('forbid-merge');
    expect(res.body.claims).toMatchObject({ sub: 'priya', act: 'worker-agent' });
  });

  it('a hold parks the run and skips later steps', async () => {
    const res = await request(app(fakeFetch())).post('/api/runs').send({ scenario: 'sprint-planning', persona: 'mary' });
    expect(res.body.status).toBe('parked');
    expect(res.body.steps).toHaveLength(2);
    expect(res.body.steps[1]).toMatchObject({ outcome: 'hold', approvalId: 'A1' });
  });

  it('never puts the token in a response', async () => {
    const f = fakeFetch();
    const res = await request(app(f)).post('/api/runs').send({ scenario: 'code-review', persona: 'priya' });
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    expect(f.seen.every((s) => s.auth === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('reports an unreachable stack as 502, not a crash', async () => {
    const res = await request(app(fakeFetch({ down: true }))).post('/api/runs').send({ scenario: 'code-review', persona: 'priya' });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('issuer_down');
  });

  it('validates input', async () => {
    const a = app(fakeFetch());
    expect((await request(a).post('/api/runs').send({})).status).toBe(400);
    expect((await request(a).post('/api/runs').send({ scenario: 'nope', persona: 'x' })).body.error).toBe('unknown_scenario');
    expect((await request(a).get('/api/runs/none')).status).toBe(404);
    expect((await request(a).get('/api/scenarios')).body.scenarios.map((s) => s.id)).toEqual(['code-review', 'sprint-planning', 'compliance-evidence', 'evidence-sweep']);
  });
});

describe('delegated lane', () => {
  it('mints one token per (agent, scope), each with its own act and a narrower scope', async () => {
    const f = mintLog();
    const res = await request(app(f)).post('/api/runs').send({ scenario: 'compliance-evidence', persona: 'priya' });
    expect(res.status).toBe(201);
    expect(f.mints.map((m) => `${m.act}:${m.scope}`)).toEqual(['github-source-agent:github:read', 'logs-source-agent:logs:read', 'kb-source-agent:kb:read']);
    expect(res.body.steps.map((s) => s.agent)).toEqual(['github-source-agent', 'logs-source-agent', 'kb-source-agent', 'github-source-agent']);
  });
});

describe('unattended lane', () => {
  it('refuses to run while disarmed, runs once armed, and parks at the held write', async () => {
    const a = app(fakeFetch());
    const refused = await request(a).post('/api/runs').send({ scenario: 'evidence-sweep', persona: 'priya' });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('disarmed');
    expect((await request(a).post('/api/arm').send({ armed: true })).body.armed).toBe(true);
    const run = await request(a).post('/api/runs').send({ scenario: 'evidence-sweep', persona: 'priya' });
    expect(run.status).toBe(201);
    expect(run.body).toMatchObject({ unattended: true, status: 'parked' });
    expect((await request(a).post('/api/arm').send({ armed: false })).body.armed).toBe(false);
    expect((await request(a).post('/api/arm').send({})).status).toBe(400);
  });

  it('the arm expires on its own after an hour', async () => {
    let t = new Date('2026-10-21T12:00:00Z').getTime();
    const a = createApp({ cfg: config({}), fetchImpl: fakeFetch(), now: () => new Date(t) });
    await request(a).post('/api/arm').send({ armed: true });
    expect((await request(a).get('/api/arm')).body.armed).toBe(true);
    t += 61 * 60 * 1000;
    expect((await request(a).get('/api/arm')).body.armed).toBe(false);
  });
});
