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
      : t === 'backlog.update_story' ? { error: { code: -32004, message: 'held for approval', data: { rule: 'hold-update', approvalId: 'A1', approvers: ['priya'] } } }
        : { result: { content: [{ type: 'text', text: JSON.stringify({ ok: t }) }] } };
    return { status: 200, headers: { get: () => '00-trace-span-01' }, json: async () => ({ jsonrpc: '2.0', id: b.id, ...reply }) };
  };
  fn.seen = seen;
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
    expect((await request(a).get('/api/scenarios')).body.scenarios.map((s) => s.id)).toEqual(['code-review', 'sprint-planning']);
  });
});
