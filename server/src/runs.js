import { randomUUID } from 'node:crypto';
import { callTool } from './pep.js';
import { mintToken, claimSummary } from './tokens.js';
import { SCENARIOS } from './scenarios.js';

export const AGENT_SUB = 'worker-agent';
export const ARM_TTL_MS = 60 * 60 * 1000;

// Runs a scenario's steps in order under one token. A deny does not stop the run (the agent reports it and moves on);
// a hold parks the run, since nothing after it should happen before a person answers; an error stops it.
export function createRunner({ cfg, fetchImpl = fetch, now = () => new Date() }) {
  const runs = new Map();
  // Arm switch for the unattended lane: off by default, expires on its own (like AI-DEMO2's autonomous flag).
  let armedUntil = 0;
  const isArmed = () => armedUntil > now().getTime();
  const arm = (on) => { armedUntil = on ? now().getTime() + ARM_TTL_MS : 0; return status(); };
  const status = () => ({ armed: isArmed(), expiresAt: isArmed() ? new Date(armedUntil).toISOString() : null });

  async function start({ scenario, persona }) {
    const sc = SCENARIOS[scenario];
    if (!sc) throw Object.assign(new Error('unknown scenario'), { code: 'unknown_scenario' });
    if (sc.lane === 'unattended' && !isArmed()) throw Object.assign(new Error('Unattended runs are disarmed. Arm them first.'), { code: 'disarmed' });
    const run = { id: randomUUID(), scenario, lane: sc.lane, persona, unattended: sc.lane === 'unattended', startedAt: now().toISOString(), status: 'running', claims: null, steps: [] };
    // One token per (agent, scope): each delegated hop is its own, narrower identity. Tokens never leave this function.
    const tokens = new Map();
    const tokenFor = async (agent, scope) => {
      const key = `${agent}|${scope ?? ''}`;
      if (!tokens.has(key)) tokens.set(key, await mintToken({ mintUrl: cfg.mintUrl, persona, act: agent, scope, fetchImpl }));
      return tokens.get(key);
    };
    const first = await tokenFor(sc.steps[0].agent ?? AGENT_SUB, sc.steps[0].scope);
    run.claims = claimSummary(first);
    runs.set(run.id, run);
    let tp;
    for (const [i, s] of sc.steps.entries()) {
      const agent = s.agent ?? AGENT_SUB;
      const token = await tokenFor(agent, s.scope);
      const out = await callTool({ url: cfg.pepUrl, token, name: s.tool, args: s.args, id: i + 1, traceparent: tp, fetchImpl });
      tp = out.traceparent ?? tp;
      run.steps.push({ agent, scope: s.scope ?? null, tool: s.tool, args: s.args, note: s.note, expected: s.expect, ...out, asDesigned: out.outcome === s.expect });
      if (out.outcome === 'hold') { run.status = 'parked'; break; }
      if (out.outcome === 'error') { run.status = 'failed'; break; }
    }
    if (run.status === 'running') run.status = 'done';
    return run;
  }

  return { start, arm, armStatus: status, get: (id) => runs.get(id) ?? null, list: () => [...runs.values()].reverse() };
}
