import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config, startupProblems } from '../src/config.js';
import { decide, PERSONAS } from '../src/mockStack.js';
import { createWorkspaces } from '../src/workspaces.js';

// Rows MEASURED against the real utility pack (privilege-demo main b3dba08, 2026-10-21). If the mock drifts from these, it lies.
const ROWS = [
  ['eli', 'github.read_pr', { repo: 'grid-ops-portal', pr: 42 }, 'allow', 'u10-engineers-pr-review'],
  ['eli', 'github.read_pr', { repo: 'meter-data-lake', pr: 7 }, 'deny', 'u40-repo-scope-engineers'],
  ['eli', 'kb.search', { query: 'x', collection: 'runbooks' }, 'allow', 'u11-engineers-research'],
  ['eli', 'cloudwatch.query_logs', { logGroup: 'security-events', query: 'x' }, 'deny', 'u41-restricted-evidence-compliance-only'],
  ['eli', 'kb.search', { query: 'x' }, 'deny', 'invalid-arguments'],
  ['eli', 'github.merge_pr', { repo: 'grid-ops-portal', pr: 42 }, 'deny', 'u20-never-merge-or-approve-pr'],
  ['cora', 'github.read_pr', { repo: 'meter-data-lake', pr: 7 }, 'allow', 'u14-compliance-evidence'],
  ['cora', 'cloudwatch.query_logs', { logGroup: 'security-events', query: 'x' }, 'allow', 'u14-compliance-evidence'],
  ['cora', 'kb.search', { query: 'x', collection: 'audit-evidence' }, 'allow', 'u14-compliance-evidence'],
  ['cora', 'github.merge_pr', { repo: 'meter-data-lake', pr: 7 }, 'deny', 'u20-never-merge-or-approve-pr'],
  ['cora', 'confluence.update_requirement', { requirementId: 'R-1', change: 'x' }, 'deny', 'u31-hold-requirement-update'],
  ['ben', 'backlog.create_story_draft', { title: 'x' }, 'allow', 'u13-analysts-backlog'],
  ['ben', 'backlog.update_story', { storyId: 'S-1', change: 'x' }, 'hold', 'u30-hold-story-update'],
  ['gwen', 'github.read_pr', { repo: 'meter-data-lake', pr: 7 }, 'allow', 'u12-governance-review'],
  ['gwen', 'kb.search', { query: 'x', collection: 'runbooks' }, 'allow', 'u12-governance-review'],
  ['gwen', 'confluence.update_requirement', { requirementId: 'R-1', change: 'x' }, 'hold', 'u31-hold-requirement-update'],
  ['gwen', 'cloudwatch.query_logs', { logGroup: 'portal-app', query: 'x' }, 'deny', 'default-deny'],
  ['eli', 'deploy.canary', { service: 'x' }, 'deny', 'unknown-tool'],
  ['eli', 'policy.change', { policyId: 'p', change: 'x' }, 'deny', 'u21-never-change-policy'],
  ['eli', 'deploy.production', { service: 'x' }, 'deny', 'u22-never-deploy'],
];

describe('mock decision table mirrors the measured utility pack', () => {
  it.each(ROWS)('%s %s -> %s (%s)', (persona, tool, args, outcome, rule) => {
    const d = decide({ groups: PERSONAS[persona], tool, args });
    expect({ outcome: d.outcome, rule: d.rule }).toEqual({ outcome, rule });
  });
  it('a hold names priya as the approver', () => {
    expect(decide({ groups: PERSONAS.ben, tool: 'backlog.update_story', args: { storyId: 'S', change: 'c' } }).approvers).toEqual(['priya']);
  });
});

const mockApp = (env = {}) => createApp({ cfg: config({ MODE: 'mock', ...env }) });
const run = (agent, scenario, persona) => agent.post('/api/runs').send(persona ? { scenario, persona } : { scenario });

describe('MODE=mock end to end (no network, no other service)', () => {
  it('runs a scenario with its own mock issuer and policy table', async () => {
    const a = request.agent(mockApp());
    const res = await run(a, 'code-review', 'eli');
    expect(res.status).toBe(201);
    expect(res.body.steps.every((s) => s.asDesigned)).toBe(true);
    expect(res.body.tokens[0].issuer).toMatch(/built-in mock issuer \(unsigned/);
  });

  it('approve runs the held call once at the policy point; the requester cannot approve their own', async () => {
    const a = request.agent(mockApp());
    const r = (await run(a, 'sprint-planning', 'ben')).body;
    expect(r.status).toBe('parked');
    expect((await a.post(`/api/runs/${r.id}/resolve`).send({ decision: 'approve', approver: 'ben' })).status).toBe(403);
    const ok = await a.post(`/api/runs/${r.id}/resolve`).send({ decision: 'approve', approver: 'priya' });
    expect(ok.body.status).toBe('done');
    expect(ok.body.steps.at(-1)).toMatchObject({ ranOnApproval: true, outcome: 'allow' });
  });

  it('reports what it is: mode, simulated, per-session workspace', async () => {
    const res = await request(mockApp({ WORKER_HOSTED: '1' })).get('/api/info');
    expect(res.body).toEqual({ mode: 'mock', hosted: true, simulated: true, workspaceId: 'per-session' });
  });
});

describe('rule 13: one visitor never touches another', () => {
  it('each browser session has its own runs, arm switch, kill switch and reset', async () => {
    const app = mockApp();
    const a = request.agent(app);
    const b = request.agent(app);
    await a.post('/api/arm').send({ armed: true });
    await run(a, 'evidence-sweep');                       // A has a parked run and is armed
    expect((await b.get('/api/arm')).body.armed).toBe(false);     // B is not armed
    expect((await b.get('/api/runs')).body.runs).toHaveLength(0); // B sees none of A's runs
    expect((await run(b, 'evidence-sweep')).status).toBe(403); // B cannot fire the unattended lane
    await b.post('/api/kill').send({});                           // B's kill switch
    await b.post('/api/reset').send({});                          // and reset
    expect((await a.get('/api/arm')).body.armed).toBe(true);      // do nothing to A
    expect((await a.get('/api/runs')).body.runs).toHaveLength(1);
  });

  it('a request with no cookie gets a fresh workspace and a hardened cookie; a forged id cannot reach another', async () => {
    const app = mockApp({ WORKER_HOSTED: '1' });
    const first = await request(app).get('/api/arm');
    const cookie = first.headers['set-cookie'][0];
    expect(cookie).toMatch(/^ws=[a-f0-9]{32}; HttpOnly; SameSite=Strict; Path=\//);
    expect(cookie).toMatch(/Secure/);
    const a = request.agent(app);
    await a.post('/api/arm').send({ armed: true });
    const forged = await request(app).get('/api/arm').set('Cookie', 'ws=' + 'a'.repeat(32));
    expect(forged.body.armed).toBe(false);
    const junk = await request(app).get('/api/arm').set('Cookie', 'ws=../../etc');
    expect(junk.headers['set-cookie'][0]).toMatch(/^ws=[a-f0-9]{32}/); // not a valid id: a new one is issued
  });

  it('the workspace store is bounded: the least recently used goes first, idle ones expire', () => {
    let t = 0;
    const ws = createWorkspaces({ cfg: config({ MODE: 'mock' }), now: () => new Date(t), max: 2, idleMs: 1000 });
    const first = ws.get('a');
    ws.get('b'); ws.get('c');
    expect(ws.size()).toBe(2);
    expect(ws.get('a')).not.toBe(first); // 'a' was evicted, so it is a new runner
    t = 5000;
    ws.get('z');
    expect(ws.size()).toBe(1);           // everything idle was dropped
  });
});

describe('mode and hosting guards', () => {
  it('rejects an unknown MODE and a hosted build that is not mock', () => {
    expect(startupProblems(config({ MODE: 'live' })).join()).toMatch(/MODE must be local or mock/);
    expect(startupProblems(config({ WORKER_HOSTED: '1' })).join()).toMatch(/requires MODE=mock/);
    expect(startupProblems(config({ MODE: 'mock', WORKER_HOSTED: '1' }))).toEqual([]);
  });
  it('mock mode ignores PEP_URL and MINT_URL entirely', () => {
    const c = config({ MODE: 'mock', PEP_URL: 'http://evil.example/mcp', MINT_URL: 'http://evil.example/mint' });
    expect(c.pepUrl).toBe('http://mock.invalid/mcp');
    expect(c.mintUrl).toBe('http://mock.invalid/mint');
    expect(startupProblems(c)).toEqual([]);
  });
  it('a hosted write is accepted from the configured public host only', async () => {
    const app = mockApp({ WORKER_HOSTED: '1', ALLOWED_ORIGIN_HOST: 'worker.se.example' });
    const post = (origin) => request(app).post('/api/reset').set('Host', '127.0.0.1:6700').set('Origin', origin).send({});
    expect((await post('https://worker.se.example')).status).toBe(200);
    expect((await post('https://evil.example')).status).toBe(403);
  });
});

describe('mock agent-subject mint mirrors the stub', () => {
  it('sub = the agent, no act, invented groups, tools:invoke; nobody else can be minted', async () => {
    const { createMockFetch } = await import('../src/mockStack.js');
    const f = createMockFetch();
    const mint = (body) => f('http://mock.invalid/mint', { method: 'POST', body: JSON.stringify(body) });
    const ok = await (await mint({ agent: 'delivery-agent' })).json();
    const claims = JSON.parse(Buffer.from(ok.access_token.split('.')[1], 'base64url').toString());
    expect(claims).toMatchObject({ sub: 'delivery-agent', groups: ['engineers', 'business-analysts'], scope: 'tools:invoke' });
    expect(claims).not.toHaveProperty('act');
    expect((await mint({ agent: 'someone-else' })).status).toBe(400);
  });
  it('the unattended sweep runs as the agent and parks at the held requirement update', async () => {
    const a = request.agent(mockApp());
    await a.post('/api/arm').send({ armed: true });
    const r = (await run(a, 'evidence-sweep')).body;
    expect(r.claims).toMatchObject({ sub: 'delivery-agent', act: null });
    expect(r.steps.map((s) => `${s.tool}:${s.outcome}`)).toEqual(['kb.search:allow', 'github.read_pr:allow', 'confluence.update_requirement:hold']);
    const done = (await a.post(`/api/runs/${r.id}/resolve`).send({ decision: 'approve', approver: 'priya' })).body;
    expect(done.status).toBe('done');
  });
});

describe('mock approvals visibility mirrors the real pack', () => {
  it('the requester gets 403, an unrelated person gets 404, the approver gets through', async () => {
    const a = request.agent(mockApp());
    const r = (await run(a, 'sprint-planning', 'ben')).body;
    const decide = (approver) => a.post(`/api/runs/${r.id}/resolve`).send({ decision: 'approve', approver });
    expect((await decide('ben')).status).toBe(403);  // the requester
    expect((await decide('cora')).status).toBe(404); // unrelated to this call
    expect((await decide('priya')).status).toBe(200);
  });
});
