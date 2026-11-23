// Rule 27: this lab's side of the shared run-observability panel. The vendored core (runObservability.js) is never edited here.
//
// What a run is here. Each tool call goes to the Privilege demo's MCP door, the policy point: the door allows, denies or holds it. Each approval
// goes to the same door. The events of one call are built ONCE, from the answer the lab already holds, the moment that answer arrives (runs.js calls
// callEvents() right after the reply). Nothing is re-run and the record is built from the stored events. Their time is that moment.
//
// Mock: the in-process door computed the answer, so each row is `simulated`. Real: each row is a `response`, the reply the lab received from the
// Privilege demo's door. This lab reads no logs in either mode, so no row is `logged`; the layers it does not see say `not-logged` and why.
// Nothing a reply carries is copied into a row or a stdout line except a fixed text, the tool name and the roster name; the trace shows the reply.
//
// Stdout line: `<iso> worker-demo decision step=<n> layer=<layer> actor=<who> result=<passed|stopped|unclear|no-reply> cause=<cause> run=<id>`.
// The family's matchers read words such as refused, denied, rejected, forbidden, failed, invalid, expired, mismatch, token, audience, scope and served,
// so causes come from the fixed table below and use none of them. An actor is written only when it is a name the lab knows (roster).
import { LAYERS, createMasker, createRunObservability } from './runObservability.js';

export const SERVICE = 'worker-demo';

// Only safe characters survive, so a typed value cannot add a second key=value pair, a quote or a line.
export const lineValue = (v, n = 64) => String(v ?? '').replace(/[^A-Za-z0-9._:/@-]+/g, '_').slice(0, n) || '-';
const { mask } = createMasker();
const field = (v) => lineValue(mask(String(v ?? '')));
// The lab's outcomes are allowed, refused and info. A refusal is a policy deny; a hold, a credential check and an approval are information.
const RESULT = { allowed: 'passed', refused: 'stopped', info: 'unclear' };
const NO_REPLY = /^The Privilege demo did not answer/;

// A recorder that throws must never break the run: the failure goes to stderr and the run goes on. Only a code (or the error's name) and a fixed text are
// written: the error's own text could carry anything, so it is never logged.
export function reportFailure(where, err) {
  process.stderr.write(`[${SERVICE}] run observability: ${lineValue(where, 40)} ${lineValue(err?.code || err?.name || 'error', 40)} (the error's text is not logged)\n`);
}
export function safely(where, fn) {
  try { return fn(); } catch (err) { reportFailure(where, err); return undefined; }
}

// Only a name the lab knows is written: a persona typed into the API could carry a matcher word.
export const actorOf = (name, roster) => (roster.includes(name) ? name : 'other');

// ---- Events ------------------------------------------------------------------------------------------------------------------------------------
// The door's verdict for one call (a call the lab completed, not one that got no reply). Fixed texts only.
function verdict(step) {
  if (step.ranOnApproval) return { outcome: 'info', cause: 'ran-on-approval', message: `The Privilege demo ran ${step.tool} once, when it was approved. Its reply is the approval's own reply, read again, so it is information.` };
  if (step.outcome === 'allow') return { outcome: 'allowed', cause: 'policy-allow', message: `The Privilege demo's policy let ${step.tool} through for ${step.agent}. The door's reply is the decision (see the trace).` };
  if (step.outcome === 'deny') return { outcome: 'refused', cause: 'policy-deny', message: `The Privilege demo's policy stopped ${step.tool} for ${step.agent}. The rule that did it is in the trace.` };
  if (step.outcome === 'hold') return { outcome: 'info', cause: 'held', message: `${step.tool} is held for a person's approval. Nothing runs until someone answers, so a hold is not a decision.` };
  if (step.trace?.response?.status === 401) return { outcome: 'info', cause: 'credential-check', message: 'The door rejected the agent\'s token (HTTP 401). A credential check is information, not a policy decision.' };
  return { outcome: 'info', cause: 'door-unreadable', message: 'The door\'s reply could not be read as a decision, so it is information. The trace shows the reply.' };
}

// The events one tool call produced, in order. A call that got no reply has no row, only a no-reply line.
export function callEvents(step, { at, who, roster, index }) {
  const actor = actorOf(who, roster);
  const base = { at, step: index + 1, who: actor };
  if (step.outcome === 'error' && NO_REPLY.test(String(step.reason ?? ''))) return [{ ...base, noReply: true, layer: 'privilege', cause: 'no-reply' }];
  const agent = { ...base, layer: 'agent', outcome: 'info', cause: 'agent-call', product: 'worker agent',
    message: `The agent ${step.agent} asked the Privilege demo's door to run ${step.tool}. The request is the agent's own act: the door's answer is the Privilege row.`,
    detail: { tool: step.tool, agent: step.agent, scope: step.scope ?? null } };
  const v = verdict(step);
  return [agent, { ...base, layer: 'privilege', product: 'Privilege demo door (policy point)', ...v, detail: { tool: step.tool, agent: step.agent } }];
}

// The person row for a run's start: who the run is for. Mock has no sign-in (a name is chosen); Real used the PingFederate sign-in token.
export function startEvents({ at, persona, unattended, mock, roster }) {
  const who = actorOf(unattended ? roster.at(-1) : persona, roster);
  if (unattended) return [{ at, who, layer: 'person', product: 'lab roster (no person)', outcome: 'info', cause: 'no-person', step: 0,
    message: 'No person is in this run. The unattended lane runs as the agent itself (sub = the agent, no act claim).' }];
  return [{ at, who, layer: 'person', product: mock ? 'lab roster (no sign-in)' : 'PingFederate sign-in (pi.flow)', outcome: 'info', cause: mock ? 'roster-name' : 'pi-flow-sign-in', step: 0,
    message: mock ? `The run started as ${who}, a name chosen in the header. Mock has no sign-in.` : `The run used the token from the lab's PingFederate sign-in, for ${who}. The sign-in itself is not read here.` }];
}

// An approval answer (or the Privilege demo's refusal of one). Information: a person's answer is not a policy decision.
// An answer that got no reply (the Privilege demo did not connect or timed out) is a no-reply event: no row, a no-reply line, and the record is partial.
export function approvalEvent({ at, approver, roster, verb, ok, error, index }) {
  const base = { at, layer: 'privilege', product: 'Privilege demo approvals', step: index + 1, who: actorOf(approver, roster), outcome: 'info' };
  if (!ok && error === 'pep_down') return { ...base, noReply: true, cause: 'no-reply', message: `The Privilege demo did not answer ${approver}'s answer, so the held call is still waiting.` };
  if (!ok) return { ...base, cause: 'answer-not-accepted', message: `The Privilege demo did not accept ${approver}'s answer, so the held call is still waiting.` };
  if (verb === 'approve') return { ...base, cause: 'approved', message: `${approver} approved the held call. An approval is a person's answer, not a policy decision.` };
  return { ...base, cause: 'approval-declined', message: `${approver} denied the held call, so it does not run.` };
}

// The held call, run once by the door when it was approved: its own row. It is the approval's reply read again, so it is information.
export function ranOnApprovalEvent(step, { at, who, roster, index }) {
  return { at, step: index + 1, who: actorOf(who, roster), layer: 'privilege', product: 'Privilege demo door (policy point)', ...verdict(step), detail: { tool: step.tool, agent: step.agent } };
}

// ---- Stdout ------------------------------------------------------------------------------------------------------------------------------------
export function decisionLine(ev, runId) {
  const result = ev.noReply ? 'no-reply' : RESULT[ev.outcome];
  return `${ev.at} ${SERVICE} decision step=${lineValue(ev.step, 8)} layer=${lineValue(ev.layer, 12)} actor=${field(ev.who)} result=${result} cause=${lineValue(ev.cause, 32)} run=${lineValue(runId, 40)}`;
}
// One line per event, each in its own try: a write that throws drops that line only. Stamped with the event's own time.
export function createRunLog({ write = (line) => process.stdout.write(`${line}\n`) } = {}) {
  return {
    lines(runId, events) {
      for (const ev of events) safely('decision-line', () => write(decisionLine(ev, runId)));
    },
  };
}

// ---- The record --------------------------------------------------------------------------------------------------------------------------------
const REASON = {
  person: 'The lab has no sign-in of its own, and the PingFederate sign-in it uses in Real is not read by this lab.',
  agent: 'The agent is the lab\'s simulated caller: its own act is shown here, and the door\'s answer is under Privilege.',
  authorize: 'This lab does not call PingOne Authorize. Each call is decided by the Privilege demo\'s policy point, shown under Privilege.',
  gateway: 'The calls went through the Privilege demo\'s MCP door, the policy point shown under Privilege. This lab reads no gateway log, so there is no separate gateway row.',
  resource: 'The tool behind the door writes no log this lab reads. An allow is the door\'s decision, not confirmation that the tool ran.',
};

// Ties (the events of one call share a time) are put back in the order they were written; ids are renumbered to match.
function inEventOrder(rec) {
  const stamped = rec.rows.filter((r) => r.at !== null).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.detail.eventSeq - b.detail.eventSeq);
  return { ...rec, rows: [...stamped.map((r, i) => ({ ...r, id: `r${i + 1}` })), ...rec.rows.filter((r) => r.at === null)] };
}

// The record of one run, built from the events stored on it. Mock rows are `simulated`; Real rows are `response` (replies the lab received).
export async function runRecord(run, { clock = Date.now } = {}) {
  const { source, events, noReplies } = run.obs;
  const mock = source === 'mock';
  const rowsFor = (layer) => events.filter((e) => e.layer === layer && !e.noReply)
    .map((e) => ({ at: e.at, product: e.product, outcome: e.outcome, message: e.message, detail: { ...e.detail, cause: e.cause, eventSeq: e.seq } }));
  const partial = noReplies
    ? `${noReplies} call${noReplies === 1 ? '' : 's'} got no reply from the Privilege demo (it did not connect, or it timed out), so ${noReplies === 1 ? 'it has' : 'they have'} no row: the record is partial.`
    : null;
  const rec = await createRunObservability({ clock }).collectRun({
    runId: run.id, startedAt: run.startedAt, endedAt: events.at(-1)?.at ?? run.startedAt, source,
    layers: LAYERS.map((layer) => ({
      layer, products: [],
      reason: layer === 'privilege' ? (partial ?? 'Each call the lab made has a row here.') : REASON[layer] ?? 'The lab has no row for this layer.',
      ...(mock ? { simulated: rowsFor(layer) } : { responses: rowsFor(layer) }),
    })),
  });
  const out = inEventOrder(rec);
  if (partial) out.reasons = { ...out.reasons, privilege: partial };
  return out;
}

// Store the events of one answer, in order, then write their lines. The run keeps them whether or not a line is written.
export function keepEvents(run, evs, log) {
  for (const ev of evs) {
    run.obs.events.push({ ...ev, seq: run.obs.events.length });
    if (ev.noReply) run.obs.noReplies++;
  }
  log.lines(run.id, evs);
}
