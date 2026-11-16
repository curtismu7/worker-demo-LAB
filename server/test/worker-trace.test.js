import { describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { createRunner } from '../src/runs.js';
import { createMockFetch } from '../src/mockStack.js';
import { callTool } from '../src/pep.js';
import { decideApproval } from '../src/approvals.js';
import { assertTrace } from '../src/gatewayTrace.js';

// The mock door as the runner sees it in Mock mode, and the same door dressed as a real one (no `mockDecisions`, so the trace cannot say "checked").
const asReal = (fetchImpl) => async (...a) => { const { mockDecisions, ...res } = await fetchImpl(...a); return res; };
const mockRunner = () => createRunner({ cfg: config({ MODE: 'mock' }), fetchImpl: createMockFetch() });
const realRunner = () => createRunner({ cfg: config({ MODE: 'local' }), fetchImpl: asReal(createMockFetch()) });
const traces = (run) => run.steps.flatMap((s) => [s.trace, s.approvalCall?.trace, s.refused?.trace]).filter(Boolean);
// A token built at run time (never a literal): three long segments, so a full bearer would trip assertTrace if it leaked.
const fakeToken = () => ['eyJ' + 'a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)].join('.');

describe('What Privilege did: Mock traces', () => {
  it('every call of a held scenario has a mock trace that passes assertTrace, all decisions checked', async () => {
    const r = mockRunner();
    const run = await r.start({ scenario: 'sprint-planning', persona: 'ben' });
    expect(run.status).toBe('parked');
    const done = await r.resolve(run.id, { decision: 'approve', approver: 'priya' });
    const all = traces(done);
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const t of all) {
      expect(assertTrace(t)).toEqual([]);
      expect(t.source).toBe('mock');
      expect(t.decisions.length).toBeGreaterThan(0);
      expect(t.decisions.every((d) => d.basis === 'checked')).toBe(true);
      expect(t.request.url).toMatch(/^http:\/\/mock\.invalid\//);
    }
  });

  it('a deny shows the rule that decided as a failed checked decision; a hold is info, never a pass', async () => {
    const r = mockRunner();
    const run = await r.start({ scenario: 'sprint-planning', persona: 'ben' });
    const held = run.steps.at(-1);
    const policy = held.trace.decisions.find((d) => d.id === 'policy');
    expect(held.outcome).toBe('hold');
    expect(policy).toMatchObject({ outcome: 'info', basis: 'checked' });
    expect(policy.evidence).toContain('u30-hold-story-update');
    const code = await mockRunner().start({ scenario: 'code-review', persona: 'eli' });
    const denied = code.steps.find((s) => s.outcome === 'deny');
    expect(denied.trace.decisions.find((d) => d.id === 'policy')).toMatchObject({ outcome: 'fail', basis: 'checked' });
    expect(denied.trace.request.body.params.name).toBe(denied.tool);
    expect(denied.trace.response.body.error.data.rule).toBe(denied.rule);
  });

  it('the approval call is a trace on the held step; the requester deciding their own call is a refused trace', async () => {
    const r = mockRunner();
    const run = await r.start({ scenario: 'sprint-planning', persona: 'ben' });
    await expect(r.resolve(run.id, { decision: 'approve', approver: 'ben' })).rejects.toMatchObject({ code: 'not_an_approver' });
    const held = r.get(run.id).steps.at(-1);
    expect(assertTrace(held.refused.trace)).toEqual([]);
    expect(held.refused.trace.response.status).toBe(403);
    expect(held.refused.trace.decisions.find((d) => d.id === 'approval').outcome).toBe('fail');
    await r.resolve(run.id, { decision: 'approve', approver: 'priya' });
    const after = r.get(run.id).steps.find((s) => s.approvalCall);
    expect(after.refused).toBeUndefined();
    expect(assertTrace(after.approvalCall.trace)).toEqual([]);
    expect(after.approvalCall.trace.request.url).toMatch(/\/api\/approvals\/[\w-]+\/approve$/);
    expect(after.approvalCall.trace.decisions.find((d) => d.id === 'approval')).toMatchObject({ outcome: 'pass', basis: 'checked' });
  });

  it('an unreadable token is a failed token check, with the policy not reached', async () => {
    const out = await callTool({ url: 'http://mock.invalid/mcp', token: 'not-a-token', name: 'kb.search', args: {}, fetchImpl: createMockFetch() });
    expect(out.outcome).toBe('error');
    expect(assertTrace(out.trace)).toEqual([]);
    expect(out.trace.response.status).toBe(401);
    expect(out.trace.decisions.map((d) => [d.id, d.outcome])).toEqual([['token', 'fail'], ['policy', 'skipped']]);
  });
});

describe('What Privilege did: Real traces', () => {
  it('no decision is ever checked; each is inferred or observed; assertTrace is clean', async () => {
    const r = realRunner();
    const run = await r.start({ scenario: 'sprint-planning', persona: 'ben' });
    const done = await r.resolve(run.id, { decision: 'approve', approver: 'priya' });
    const all = traces(done);
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const t of all) {
      expect(assertTrace(t)).toEqual([]);
      expect(t.source).toBe('real');
      expect(t.decisions.every((d) => d.basis === 'inferred' || d.basis === 'observed')).toBe(true);
    }
  });

  it('a refusal reads the rule from the reply (observed); a hold is info; an allow is inferred', async () => {
    const r = realRunner();
    const held = (await r.start({ scenario: 'sprint-planning', persona: 'ben' })).steps.at(-1);
    expect(held.trace.decisions.find((d) => d.id === 'policy')).toMatchObject({ outcome: 'info', basis: 'observed' });
    expect(held.trace.decisions.find((d) => d.id === 'policy').evidence).toContain('priya');
    const code = await realRunner().start({ scenario: 'code-review', persona: 'eli' });
    const denied = code.steps.find((s) => s.outcome === 'deny');
    expect(denied.trace.decisions.find((d) => d.id === 'policy')).toMatchObject({ outcome: 'fail', basis: 'observed' });
    const allowed = code.steps.find((s) => s.outcome === 'allow');
    expect(allowed.trace.decisions.find((d) => d.id === 'grant')).toMatchObject({ outcome: 'pass', basis: 'inferred', label: 'Policy' });
  });

  it('the token is never in a real trace: only its length', async () => {
    const token = fakeToken();
    const seen = [];
    const fetchImpl = async (url, init) => { seen.push(init.headers.authorization); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{}' }] } }) }; };
    const out = await callTool({ url: 'http://127.0.0.1:4510/mcp', token, name: 'kb.search', args: { query: 'x', collection: 'runbooks' }, fetchImpl });
    expect(seen[0]).toBe(`Bearer ${token}`); // the call itself still carries it
    expect(JSON.stringify(out.trace)).not.toContain(token);
    expect(JSON.stringify(out.trace)).not.toContain(token.split('.')[1]);
    expect(out.trace.request.headers.authorization).toBe(`Bearer <token, ${token.length} characters, kept on the server>`);
    expect(assertTrace(out.trace)).toEqual([]);
    expect(Object.keys(out.trace.request.headers)).not.toContain('accept'); // the lab sends none
  });

  it('a door that does not answer is a trace with no response and a failed reach, for a call and for an approval', async () => {
    const down = async () => { throw new Error('ECONNREFUSED'); };
    const call = await callTool({ url: 'http://127.0.0.1:4510/mcp', token: fakeToken(), name: 'kb.search', args: {}, fetchImpl: down });
    expect(call.outcome).toBe('error');
    expect(call.trace.response).toBeNull();
    expect(assertTrace(call.trace)).toEqual([]);
    expect(call.trace.decisions[0]).toMatchObject({ id: 'reach', outcome: 'fail', basis: 'observed' });
    const appr = await decideApproval({ pepUrl: 'http://127.0.0.1:4510/mcp', token: fakeToken(), approvalId: 'A1', verb: 'approve', fetchImpl: down });
    expect(appr.error).toBe('pep_down');
    expect(appr.trace.response).toBeNull();
    expect(assertTrace(appr.trace)).toEqual([]);
  });

  it('a 401 and an unreadable 200 still carry a clean trace', async () => {
    const mk = (status, json) => async () => ({ ok: status < 300, status, headers: { get: () => null }, json });
    const a = await callTool({ url: 'http://127.0.0.1:4510/mcp', token: fakeToken(), name: 'kb.search', args: {}, fetchImpl: mk(401, async () => ({ error: 'invalid_token' })) });
    expect(a.reason).toMatch(/401/);
    expect(assertTrace(a.trace)).toEqual([]);
    expect(a.trace.decisions[0]).toMatchObject({ id: 'authenticated', outcome: 'fail', basis: 'inferred' });
    const b = await callTool({ url: 'http://127.0.0.1:4510/mcp', token: fakeToken(), name: 'kb.search', args: {}, fetchImpl: mk(200, async () => { throw new Error('bad json'); }) });
    expect(b.reason).toMatch(/Unreadable/);
    expect(assertTrace(b.trace)).toEqual([]);
  });

  it('a refused approval (403) is observed as a failed approval, authentication inferred', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, headers: { get: () => null }, json: async () => ({ error: 'not_an_approver' }) });
    const out = await decideApproval({ pepUrl: 'http://127.0.0.1:4510/mcp', token: fakeToken(), approvalId: 'A1', verb: 'approve', fetchImpl });
    expect(out.ok).toBe(false);
    expect(assertTrace(out.trace)).toEqual([]);
    expect(out.trace.decisions.map((d) => [d.id, d.outcome, d.basis])).toEqual([['authenticated', 'pass', 'inferred'], ['approval', 'fail', 'observed']]);
    expect(out.trace.request.body).toEqual({});
  });
});
