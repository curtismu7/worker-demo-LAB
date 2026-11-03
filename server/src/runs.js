import { randomUUID } from 'node:crypto';
import { callTool } from './pep.js';
import { decideApproval } from './approvals.js';
import { mintToken, claimSummary } from './tokens.js';
import { createPiFlowLogin } from './pfTokens.js';
import { SCENARIOS, AGENT_SUB } from './scenarios.js';

export { AGENT_SUB };
export const ARM_TTL_MS = 60 * 60 * 1000;

// Runs a scenario's steps in order. A deny does not stop the run (the agent reports it and moves on); a hold parks the run,
// since nothing after it should happen before a person answers; an error stops it. A parked run is finished by resolve().
export function createRunner({ cfg, fetchImpl = fetch, now = () => new Date() }) {
  const pfLoginClient = cfg.pfAuthClientId ? createPiFlowLogin({ cfg, fetchImpl, now }) : null;
  const runs = new Map();
  const ctxs = new Map(); // runId -> { tokens, tp }. Server-side only: tokens never reach a response.

  // Arm switch for the unattended lane: off by default, expires on its own (like AI-DEMO2's autonomous flag).
  let armedUntil = 0;
  const isArmed = () => armedUntil > now().getTime();
  const status = () => ({ armed: isArmed(), expiresAt: isArmed() ? new Date(armedUntil).toISOString() : null });
  const arm = (on) => { armedUntil = on ? now().getTime() + ARM_TTL_MS : 0; return status(); };

  // Kill switch: disarm, and cancel every run still waiting on a human so nothing resumes later.
  function kill() {
    armedUntil = 0;
    let cancelled = 0;
    for (const r of runs.values()) if (r.status === 'parked') { r.status = 'cancelled'; r.parkedAt = null; cancelled++; ctxs.delete(r.id); }
    return { ...status(), cancelled };
  }

  // Unattended steps all run as the agent itself: sub = the agent, no act, no person. Every other lane is a person with an acting agent.
  // Real mode: the pi.flow-verified person token (set by /api/auth/real/credentials) answers every person
  // lane; the unattended lane uses a client_credentials M2M token from the same PingFederate.
  const realPerson = () => (ctx.realPerson !== undefined ? ctx.realPerson : null);
  const realM2m = () => (ctx.realM2m !== undefined ? ctx.realM2m : null);

  const tokenFor = (ctx, persona, agent, scope) => {
    const subjectAgent = ctx.run?.unattended === true;
    const key = subjectAgent ? `agent|${AGENT_SUB}` : `${persona}|${agent}|${scope ?? ''}`;
    if (cfg.mode === 'local' && ctx.realToken) {
      // A real PingFederate token is the identity: person lanes share the signed-in user's token; the
      // unattended lane needs the M2M token, fetched once per workspace.
      if (subjectAgent) {
        if (!ctx.realM2m) {
          ctx.realM2m = pfLoginClient.clientCredentials().then((r) => {
            if (!r.ok || typeof r.json?.access_token !== 'string') throw Object.assign(new Error('the M2M token request failed'), { code: 'm2m_failed' });
            const jwt = r.json.access_token;
            ctx.run?.tokens.push({ agent, scope: cfg.pfM2mScope, mock: false, issuer: 'PingFederate (client_credentials)', jwt, claims: claimSummary(jwt) });
            return jwt;
          }, (e) => { ctx.realM2m = undefined; throw e; });
        }
        return ctx.realM2m;
      }
      if (!ctx.realPerson) throw Object.assign(new Error('Sign in with PingFederate first: the Real button on the page.'), { code: 'real_signin_required' });
      return Promise.resolve(ctx.realToken);
    }
    if (!ctx.tokens.has(key)) {
      const p = mintToken({ mintUrl: cfg.mintUrl, fetchImpl, ...(subjectAgent ? { agent: AGENT_SUB } : { persona, act: agent, scope }) });
      ctx.tokens.set(key, p);
      // Rule 4: this is education, so the raw mock-issued token is shown, labelled. It is from the stub issuer, not PingFederate.
      p.then((jwt) => ctx.run?.tokens.push({ agent, scope: scope ?? null, mock: true, issuer: cfg.mode === 'mock' ? 'built-in mock issuer (unsigned, not PingFederate)' : 'stub issuer (not PingFederate)', jwt, claims: claimSummary(jwt) }), () => {});
    }
    return ctx.tokens.get(key);
  };

  async function execute(run, ctx, from) {
    const sc = SCENARIOS[run.scenario];
    run.status = 'running';
    for (let i = from; i < sc.steps.length; i++) {
      const s = sc.steps[i];
      const agent = s.agent ?? AGENT_SUB;
      const out = await callTool({ url: cfg.pepUrl, token: await tokenFor(ctx, run.persona, agent, s.scope), name: s.tool, args: s.args, id: i + 1, traceparent: ctx.tp, fetchImpl });
      ctx.tp = out.traceparent ?? ctx.tp;
      run.steps.push({ index: i, agent, scope: s.scope ?? null, tool: s.tool, args: s.args, note: s.note, expected: s.expect, ...out, asDesigned: out.outcome === s.expect });
      if (out.outcome === 'hold') { run.status = 'parked'; run.parkedAt = i; return; }
      if (out.outcome === 'error') { run.status = 'failed'; return; }
    }
    run.status = 'done';
  }

  async function start({ scenario, persona }) {
    const sc = SCENARIOS[scenario];
    if (!sc) throw Object.assign(new Error('unknown scenario'), { code: 'unknown_scenario' });
    if (sc.lane === 'unattended' && !isArmed()) throw Object.assign(new Error('Unattended runs are disarmed. Arm them first.'), { code: 'disarmed' });
    if (sc.lane !== 'unattended' && typeof persona !== 'string') throw Object.assign(new Error('persona is required'), { code: 'persona_required' });
    const run = { id: randomUUID(), scenario, lane: sc.lane, persona: sc.lane === 'unattended' ? null : persona, unattended: sc.lane === 'unattended', startedAt: now().toISOString(), status: 'running', claims: null, parkedAt: null, tokens: [], steps: [] };
    const ctx = { tokens: new Map(), tp: undefined, run, realToken, realM2m: undefined };
    run.claims = claimSummary(await tokenFor(ctx, persona, sc.steps[0].agent ?? AGENT_SUB, sc.steps[0].scope));
    runs.set(run.id, run); ctxs.set(run.id, ctx);
    await execute(run, ctx, 0);
    return run;
  }

  // Finish a parked run. approve/deny go to the Privilege demo's approvals API as the approver (never as the run's own person: the
  // PEP refuses self-approval). 'expire' just stops waiting here; it does not touch the PEP's record, which lapses on its own TTL.
  async function resolve(id, { decision, approver = 'priya' }) {
    const run = runs.get(id);
    if (!run) throw Object.assign(new Error('not found'), { code: 'not_found' });
    if (run.status !== 'parked') throw Object.assign(new Error(`Run is ${run.status}, not waiting for approval.`), { code: 'not_parked' });
    const held = run.steps[run.steps.length - 1];
    const ctx = ctxs.get(id);
    if (decision === 'expire') { run.status = 'expired'; run.parkedAt = null; ctxs.delete(id); return run; }
    if (decision !== 'approve' && decision !== 'deny') throw Object.assign(new Error('decision must be approve, deny or expire'), { code: 'bad_decision' });

    const approverToken = await mintToken({ mintUrl: cfg.mintUrl, persona: approver, fetchImpl });
    const res = await decideApproval({ pepUrl: cfg.pepUrl, token: approverToken, approvalId: held.approvalId, verb: decision, fetchImpl });
    if (!res.ok) throw Object.assign(new Error(res.reason), { code: res.error });
    held.resolution = { decision, by: approver };
    if (decision === 'deny') { run.status = 'denied'; run.parkedAt = null; ctxs.delete(id); return run; }

    // Approved: the Privilege demo runs the held call itself, once, at the moment of approval (privilege-demo pep.resolve). The agent does
    // not retry (a retry would just be held again). The approval record carries the outcome; show it, then carry on with the plan.
    const o = res.record?.outcome;
    run.steps.push({ index: held.index, ranOnApproval: true, agent: held.agent, scope: held.scope, tool: held.tool, args: held.args, note: 'Run once by the policy point when the approval was given.',
      expected: 'allow', outcome: o?.executed ? 'allow' : o?.decision === 'deny' ? 'deny' : 'error', rule: o?.rule, reason: o?.reason, result: o?.result, asDesigned: o?.executed === true });
    run.parkedAt = null;
    if (!o?.executed) { run.status = 'failed'; ctxs.delete(id); return run; }
    await execute(run, ctx, held.index + 1);
    return run;
  }

  // Reset: forget every run and disarm. The same state a fresh start has.
  function reset() { armedUntil = 0; runs.clear(); ctxs.clear(); return { reset: true }; }

  // Real sign-in: store the pi.flow-verified person token on the workspace's live context(s).
  function setRealToken({ person }) {
    for (const ctx of ctxs.values()) ctx.realToken = person;
    realToken = person;
  }
  let realToken = null;
  return { start, resolve, kill, reset, arm, armStatus: status, get: (id) => runs.get(id) ?? null, list: () => [...runs.values()].reverse(), setRealToken, realToken: () => realToken };
}
