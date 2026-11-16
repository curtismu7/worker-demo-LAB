// "What Privilege did" for this lab (Rule 25): turns one call to the Privilege demo's door into the record GatewayTrace.jsx draws, with
// the shared builder (gatewayTrace.js, vendored). Two calls are shown: the MCP tools/call (pep.js) and the approver's decision (approvals.js).
//
// Mock: the in-process door (mockStack.js) computed the decisions and attaches them to its reply as `mockDecisions`; they are 'checked'.
//   The mock reports the check that decided (token, then policy), not every check inside its table, and says so.
// Real: the local Privilege demo answers with a status and a body, not a per-check breakdown. A decision is 'inferred' (read from the
//   outcome) or 'observed' (read from the reply, e.g. the rule and reason in a JSON-RPC refusal). Never 'checked'.
// Secrets: the Authorization line never carries a token: mock shows the placeholder-style shortening of an unsigned mock token, real shows
//   only its length. Request bodies hold no secret (a tool name and its arguments, or `{}`).
import { bearerForDisplay, failureTrace, mockTrace, realTrace, sentHeaders } from './gatewayTrace.js';

const SAFE_RESPONSE_HEADERS = ['content-type', 'traceparent', 'x-request-id'];

const responseHeaders = (res) => {
  const out = {};
  for (const name of SAFE_RESPONSE_HEADERS) { const v = res.headers?.get?.(name); if (typeof v === 'string' && v) out[name] = v; }
  return out;
};

const authLine = (token, mock) => (mock ? bearerForDisplay(`Bearer ${token}`) : bearerForDisplay(`Bearer ${token}`, () => token));
// The mock door ignores the URL, so a mock call never shows a host that might be real (the mode can be switched at run time).
const mockUrl = (url) => { try { return `http://mock.invalid${new URL(String(url)).pathname}`; } catch { return 'http://mock.invalid/'; } };
const isMock = (res) => Array.isArray(res?.mockDecisions);
const dec = (id, label, outcome, basis, evidence) => ({ id, label, outcome, basis, evidence });

// ---- tools/call ------------------------------------------------------------------------------------------
export function toolCallTrace({ url, token, rpc, traceparent, res, body }) {
  const requestHeaders = { accept: null, ...(traceparent ? { traceparent } : {}) };
  if (isMock(res)) {
    return mockTrace({ url: mockUrl(url), authorization: authLine(token, true), rpc, status: res.status, body, headers: { 'content-type': 'application/json', ...responseHeaders(res) }, requestHeaders, decisions: res.mockDecisions,
      record: 'The mock door keeps no log; the decisions above are what its policy table computed.' });
  }
  const t = realTrace({ url: String(url), authorization: authLine(token, false), rpc, status: res.status, headers: responseHeaders(res), body, requestHeaders,
    grant: { label: 'Policy', pass: () => `the door answered with a result, so its policy allowed ${rpc?.params?.name || 'the call'} for this caller` } });
  // A policy refusal arrives as HTTP 200 with a JSON-RPC error (-32003 deny, -32004 hold) whose data names the rule: that is read from the reply.
  const e = res.status === 200 ? body?.error : undefined;
  if (e && (e.code === -32003 || e.code === -32004)) {
    const d = e.data ?? {};
    const held = e.code === -32004;
    const what = `${held ? 'held for approval' : 'denied'}${d.rule ? ` by rule ${d.rule}` : ''}${d.reason ? `: ${d.reason}` : ''}${held && Array.isArray(d.approvers) && d.approvers.length ? ` (approvers: ${d.approvers.join(', ')})` : ''}`;
    t.decisions = t.decisions.map((x) => (x.id === 'result' ? dec('policy', 'Policy', held ? 'info' : 'fail', 'observed', what) : x));
  }
  return t;
}

// The door could not be reached: a request, but no reply and no decision to show.
export const toolCallFailureTrace = ({ url, token, rpc, traceparent, error }) =>
  failureTrace({ url: String(url), authorization: authLine(token, false), rpc, error: error || 'no answer', requestHeaders: { accept: null, ...(traceparent ? { traceparent } : {}) } });

// ---- the approver's decision (POST /api/approvals/:id/:verb) ---------------------------------------------
export function approvalTrace({ url, token, verb, res, body, error }) {
  const authorization = res && isMock(res) ? authLine(token, true) : authLine(token, false);
  if (!res) return failureTrace({ url: String(url), authorization, rpc: {}, error: error || 'no answer', requestHeaders: { accept: null } });
  if (isMock(res)) {
    return mockTrace({ url: mockUrl(url), authorization, rpc: {}, status: res.status, body, headers: { 'content-type': 'application/json', ...responseHeaders(res) }, requestHeaders: { accept: null }, decisions: res.mockDecisions });
  }
  const s = res.status;
  const decisions = s === 401
    ? [dec('authenticated', 'Token', 'fail', 'inferred', 'HTTP 401: the approver\'s token was not accepted'), dec('approval', 'Approval', 'skipped', 'inferred', 'not reached: the caller was not accepted')]
    : [dec('authenticated', 'Token', 'pass', 'inferred', `HTTP ${s}: the door answered, which it does only after it knows the caller`),
      s >= 200 && s < 300
        ? (typeof body?.status === 'string'
          ? dec('approval', 'Approval', 'pass', 'observed', `the approval record says ${body.status}${body.outcome?.executed === true ? '; the held call ran once' : body.outcome?.executed === false ? '; the held call did not run' : ''}`)
          : dec('approval', 'Approval', 'pass', 'inferred', `HTTP ${s}: the door accepted the ${verb}; the reply had no approval record to read`))
        : dec('approval', 'Approval', 'fail', 'observed', `the door refused: ${typeof body?.error === 'string' ? body.error : `HTTP ${s}`}`)];
  return { source: 'real', request: { method: 'POST', url: String(url), headers: sentHeaders(authorization, { accept: null }), body: {} },
    response: { status: s, headers: responseHeaders(res), body }, decisions, record: 'See the Privilege demo\'s own approvals record for this call.' };
}

