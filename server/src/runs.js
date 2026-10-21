import { randomUUID } from 'node:crypto';
import { callTool } from './pep.js';
import { mintToken, claimSummary } from './tokens.js';
import { SCENARIOS } from './scenarios.js';

export const AGENT_SUB = 'worker-agent';

// Runs a scenario's steps in order under one token. A deny does not stop the run (the agent reports it and moves on);
// a hold parks the run, since nothing after it should happen before a person answers; an error stops it.
export function createRunner({ cfg, fetchImpl = fetch, now = () => new Date() }) {
  const runs = new Map();

  async function start({ scenario, persona }) {
    const sc = SCENARIOS[scenario];
    if (!sc) throw Object.assign(new Error('unknown scenario'), { code: 'unknown_scenario' });
    const token = await mintToken({ mintUrl: cfg.mintUrl, persona, act: AGENT_SUB, fetchImpl });
    const run = { id: randomUUID(), scenario, lane: sc.lane, persona, startedAt: now().toISOString(), status: 'running', claims: claimSummary(token), steps: [] };
    runs.set(run.id, run);
    let tp;
    for (const [i, s] of sc.steps.entries()) {
      const out = await callTool({ url: cfg.pepUrl, token, name: s.tool, args: s.args, id: i + 1, traceparent: tp, fetchImpl });
      tp = out.traceparent ?? tp;
      run.steps.push({ tool: s.tool, args: s.args, note: s.note, expected: s.expect, ...out, asDesigned: out.outcome === s.expect });
      if (out.outcome === 'hold') { run.status = 'parked'; break; }
      if (out.outcome === 'error') { run.status = 'failed'; break; }
    }
    if (run.status === 'running') run.status = 'done';
    return run;
  }

  return { start, get: (id) => runs.get(id) ?? null, list: () => [...runs.values()].reverse() };
}
