import { randomUUID } from 'node:crypto';
import { callTool } from './pep.js';
import { decideApproval } from './approvals.js';
import { mintToken, claimSummary } from './tokens.js';
import { SCENARIOS } from './scenarios.js';

export const AGENT_SUB = 'worker-agent';
export const ARM_TTL_MS = 60 * 60 * 1000;

// Runs a scenario's steps in order. A deny does not stop the run (the agent reports it and moves on); a hold parks the run,
// since nothing after it should happen before a person answers; an error stops it. A parked run is finished by resolve().
export function createRunner({ cfg, fetchImpl = fetch, now = () => new Date() }) {
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

  const tokenFor = (ctx, persona, agent, scope, extra = {}) => {
    const key = `${persona}|${agent}|${scope ?? ''}`;
    if (!ctx.tokens.has(key)) {
      const p = mintToken({ mintUrl: cfg.mintUrl, persona, act: agent, scope, fetchImpl, ...extra });
      ctx.tokens.set(key, p);
      // Rule 4: this is education, so the raw mock-issued token is shown, labelled. It is from the stub issuer, not PingFederate.
      p.then((jwt) => ctx.run?.tokens.push({ agent, scope: scope ?? null, mock: true, issuer: 'stub issuer (not PingFederate)', jwt, claims: claimSummary(jwt) }), () => {});
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
    const run = { id: randomUUID(), scenario, lane: sc.lane, persona, unattended: sc.lane === 'unattended', startedAt: now().toISOString(), status: 'running', claims: null, parkedAt: null, tokens: [], steps: [] };
    const ctx = { tokens: new Map(), tp: undefined, run };
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

    // Approved: the agent retries the held call, then carries on with the rest of the plan.
    const sc = SCENARIOS[run.scenario];
    const s = sc.steps[held.index];
    const agent = s.agent ?? AGENT_SUB;
    const out = await callTool({ url: cfg.pepUrl, token: await tokenFor(ctx, run.persona, agent, s.scope), name: s.tool, args: s.args, id: 100 + held.index, traceparent: ctx.tp, fetchImpl });
    ctx.tp = out.traceparent ?? ctx.tp;
    run.steps.push({ index: held.index, retry: true, agent, scope: s.scope ?? null, tool: s.tool, args: s.args, note: 'Retried after approval.', expected: 'allow', ...out, asDesigned: out.outcome === 'allow' });
    run.parkedAt = null;
    if (out.outcome === 'hold') { run.status = 'parked'; run.parkedAt = held.index; return run; }
    if (out.outcome === 'error') { run.status = 'failed'; return run; }
    await execute(run, ctx, held.index + 1);
    return run;
  }

  // Reset: forget every run and disarm. The same state a fresh start has.
  function reset() { armedUntil = 0; runs.clear(); ctxs.clear(); return { reset: true }; }

  return { start, resolve, kill, reset, arm, armStatus: status, get: (id) => runs.get(id) ?? null, list: () => [...runs.values()].reverse() };
}
