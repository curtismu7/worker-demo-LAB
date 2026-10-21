import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';

const jwt = (c) => `h.${Buffer.from(JSON.stringify(c)).toString('base64url')}.s`;
const subOf = (auth) => JSON.parse(Buffer.from(auth.replace('Bearer ', '').split('.')[1], 'base64url').toString()).sub;

// Fake Privilege demo: decides by tool name the way the shipped policies are specced, and runs a tiny approvals API.
function fakeFetch({ down = false } = {}) {
  const seen = [];
  const minted = new Set();
  const approved = new Set();
  const calls = [];
  const fn = async (url, init) => {
    if (down) throw new Error('ECONNREFUSED');
    const u = String(url);
    const b = JSON.parse(init.body || '{}');
    if (u.endsWith('/mint')) {
      const t = jwt({ sub: b.persona, groups: ['governance-reviewers'], aud: 'pep', exp: 9999999999, ...(b.act ? { act: { sub: b.act } } : {}), n: minted.size });
      minted.add(t);
      return { ok: true, status: 200, json: async () => ({ access_token: t }) };
    }
    const m = u.match(/\/api\/approvals\/([\w-]+)\/(approve|deny)$/);
    if (m) {
      calls.push({ id: m[1], verb: m[2], by: subOf(init.headers.authorization) });
      if (subOf(init.headers.authorization) === 'mary' || subOf(init.headers.authorization) === 'eli') return { ok: false, status: 403, json: async () => ({ error: 'not_an_approver' }) };
      if (m[2] === 'approve') approved.add(m[1]);
      const outcome = m[2] === 'approve' ? { decision: 'allow', rule: 'u13-analysts-backlog', executed: true, result: { mock: true, status: 'updated' } } : { decision: 'deny', rule: 'hold', executed: false };
      return { ok: true, status: 200, json: async () => ({ id: m[1], status: m[2] === 'approve' ? 'approved' : 'denied', outcome }) };
    }
    seen.push({ auth: init.headers.authorization, name: b.params.name });
    const t = b.params.name;
    const heldTool = t === 'backlog.update_story' || t === 'confluence.update_requirement';
    const otherRepo = t === 'github.read_pr' && b.params.arguments.repo === 'meter-data-lake' && subOf(init.headers.authorization) === 'eli';
    const reply = t === 'github.merge_pr' ? { error: { code: -32003, message: 'denied by policy', data: { rule: 'forbid-merge', reason: 'no merge authority' } } }
      : otherRepo ? { error: { code: -32003, message: 'denied by policy', data: { rule: 'u40-repo-scope-engineers', reason: 'other team repo' } } }
      : heldTool && !approved.has('A1') ? { error: { code: -32004, message: 'held for approval', data: { rule: 'hold-update', approvalId: 'A1', approvers: ['priya'] } } }
        : { result: { content: [{ type: 'text', text: JSON.stringify({ ok: t }) }] } };
    return { status: 200, headers: { get: () => '00-trace-span-01' }, json: async () => ({ jsonrpc: '2.0', id: b.id, ...reply }) };
  };
  Object.assign(fn, { seen, minted, calls });
  return fn;
}
// Records the (act, scope) each mint asked for, to prove every delegated hop gets its own narrower token.
function mintLog() {
  const mints = [];
  const base = fakeFetch();
  const fn = async (url, init) => { if (String(url).endsWith('/mint')) mints.push(JSON.parse(init.body)); return base(url, init); };
  fn.mints = mints;
  return fn;
}
const app = (f) => createApp({ cfg: config({}), fetchImpl: f });

describe('runs', () => {
  it('attended code review: reads allowed, merge denied, run finishes as designed', async () => {
    const f = fakeFetch();
    const res = await request(app(f)).post('/api/runs').send({ scenario: 'code-review', persona: 'eli' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('done');
    expect(res.body.steps.map((s) => s.outcome)).toEqual(['allow', 'allow', 'allow', 'deny', 'deny']);
    expect(res.body.steps.every((s) => s.asDesigned)).toBe(true);
    expect(res.body.steps[3].rule).toBe('u40-repo-scope-engineers');
    expect(res.body.steps[4].rule).toBe('forbid-merge');
    expect(res.body.claims).toMatchObject({ sub: 'eli', act: 'delivery-agent' });
  });

  it('a hold parks the run and skips later steps', async () => {
    const res = await request(app(fakeFetch())).post('/api/runs').send({ scenario: 'sprint-planning', persona: 'mary' });
    expect(res.body.status).toBe('parked');
    expect(res.body.steps).toHaveLength(2);
    expect(res.body.steps[1]).toMatchObject({ outcome: 'hold', approvalId: 'A1' });
  });

  it('shows the mock-issued run tokens, labelled (rule 4), and sends only them to the PEP', async () => {
    const f = fakeFetch();
    const res = await request(app(f)).post('/api/runs').send({ scenario: 'code-review', persona: 'priya' });
    expect(res.body.tokens).toHaveLength(1);
    expect(res.body.tokens[0]).toMatchObject({ mock: true, issuer: 'stub issuer (not PingFederate)', agent: 'delivery-agent' });
    expect(res.body.tokens[0].jwt.split('.')).toHaveLength(3);
    expect(f.seen.every((s) => s.auth === `Bearer ${res.body.tokens[0].jwt}`)).toBe(true);
  });

  it('never shows the approver token (it is not part of the run)', async () => {
    const f = fakeFetch();
    const a = app(f);
    const run = (await request(a).post('/api/runs').send({ scenario: 'sprint-planning', persona: 'mark' })).body;
    const done = (await request(a).post(`/api/runs/${run.id}/resolve`).send({ decision: 'approve', approver: 'priya' })).body;
    const shown = new Set(done.tokens.map((t) => t.jwt));
    expect([...f.minted].filter((t) => !shown.has(t))).toHaveLength(1); // exactly the approver's token stays hidden
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
    expect((await request(a).get('/api/scenarios')).body.scenarios.map((s) => s.id)).toEqual(['code-review', 'restricted-evidence', 'sprint-planning', 'compliance-evidence', 'evidence-sweep']);
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

describe('parked runs: approve, deny, expire, kill', () => {
  const park = async (a, persona = 'eli', scenario = 'sprint-planning') => (await request(a).post('/api/runs').send({ scenario, persona })).body;

  it('approve: the approver decides, the policy point runs the held call once, and the run finishes (no agent retry)', async () => {
    const f = fakeFetch();
    const a = app(f);
    const run = await park(a, 'mark');
    expect(run.status).toBe('parked');
    const res = await request(a).post(`/api/runs/${run.id}/resolve`).send({ decision: 'approve', approver: 'priya' });
    expect(res.status).toBe(200);
    expect(f.calls).toEqual([{ id: 'A1', verb: 'approve', by: 'priya' }]);
    expect(res.body.status).toBe('done');
    const last = res.body.steps.at(-1);
    expect(last).toMatchObject({ ranOnApproval: true, outcome: 'allow', tool: 'backlog.update_story', result: { mock: true, status: 'updated' } });
    // The agent never calls the held tool again: exactly one tools/call for it (the original, held one).
    expect(f.seen.filter((s) => s.name === 'backlog.update_story')).toHaveLength(1);
    expect(res.body.steps.find((s) => s.outcome === 'hold').resolution).toEqual({ decision: 'approve', by: 'priya' });
  });

  it('deny: nothing is retried', async () => {
    const f = fakeFetch();
    const a = app(f);
    const run = await park(a, 'mark');
    const res = await request(a).post(`/api/runs/${run.id}/resolve`).send({ decision: 'deny' });
    expect(res.body.status).toBe('denied');
    expect(res.body.steps).toHaveLength(2);
    expect(f.calls[0]).toMatchObject({ verb: 'deny', by: 'priya' });
  });

  it('expire: stops waiting and never calls the approvals API', async () => {
    const f = fakeFetch();
    const a = app(f);
    const run = await park(a, 'mark');
    const res = await request(a).post(`/api/runs/${run.id}/resolve`).send({ decision: 'expire' });
    expect(res.body.status).toBe('expired');
    expect(f.calls).toEqual([]);
  });

  it('refuses a non-approver and leaves the run parked', async () => {
    const a = app(fakeFetch());
    const run = await park(a, 'mark');
    const res = await request(a).post(`/api/runs/${run.id}/resolve`).send({ decision: 'approve', approver: 'mary' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not_an_approver');
    expect((await request(a).get(`/api/runs/${run.id}`)).body.status).toBe('parked');
  });

  it('rejects bad input and a run that is not parked', async () => {
    const a = app(fakeFetch());
    const run = await park(a, 'mark');
    expect((await request(a).post(`/api/runs/${run.id}/resolve`).send({ decision: 'maybe' })).status).toBe(400);
    expect((await request(a).post('/api/runs/none/resolve').send({ decision: 'approve' })).status).toBe(404);
    await request(a).post(`/api/runs/${run.id}/resolve`).send({ decision: 'deny' });
    expect((await request(a).post(`/api/runs/${run.id}/resolve`).send({ decision: 'approve' })).status).toBe(409);
  });

  it('kill switch disarms and cancels parked runs so they cannot resume', async () => {
    const a = app(fakeFetch());
    await request(a).post('/api/arm').send({ armed: true });
    const run = await park(a, 'mark', 'evidence-sweep');
    expect(run.status).toBe('parked');
    const k = await request(a).post('/api/kill').send({});
    expect(k.body).toMatchObject({ armed: false, cancelled: 1 });
    expect((await request(a).get(`/api/runs/${run.id}`)).body.status).toBe('cancelled');
    expect((await request(a).post(`/api/runs/${run.id}/resolve`).send({ decision: 'approve' })).status).toBe(409);
    expect((await request(a).post('/api/runs').send({ scenario: 'evidence-sweep', persona: 'mark' })).status).toBe(403);
  });
});
