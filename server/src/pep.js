// Calls the Privilege demo's MCP door (JSON-RPC tools/call over POST, Bearer token) and turns the reply into one outcome.
// Contract (privilege-demo app.js): result -> allow; error -32004 -> hold (data.approvalId); error -32003 -> deny. HTTP 401 -> unauthenticated.
import { toolCallFailureTrace, toolCallTrace } from './workerTrace.js';

// Every outcome also carries `trace` (Rule 25, "What Privilege did"): the exact request, the exact reply and the decisions, built by workerTrace.js.
export async function callTool({ url, token, name, args, id = 1, traceparent, fetchImpl = fetch, timeoutMs = 5000 }) {
  const rpc = { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args ?? {} } };
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(traceparent ? { traceparent } : {}) },
      body: JSON.stringify(rpc),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) { return { outcome: 'error', reason: 'The Privilege demo did not answer. Start it or set PEP_URL.', trace: toolCallFailureTrace({ url, token, rpc, traceparent, error: e?.message }) }; }

  const traceOut = res.headers?.get?.('traceparent') ?? undefined;
  let body;
  let unreadable = false;
  try { body = await res.json(); } catch { body = null; unreadable = true; }
  const trace = toolCallTrace({ url, token, rpc, traceparent, res, body });
  if (res.status === 401) return { outcome: 'error', reason: 'The Privilege demo rejected the token (401).', traceparent: traceOut, trace };
  if (unreadable) return { outcome: 'error', reason: `Unreadable reply (HTTP ${res.status}).`, traceparent: traceOut, trace };

  if (body?.result) {
    let result = body.result;
    try { result = JSON.parse(body.result.content?.[0]?.text); } catch { /* keep raw */ }
    return { outcome: 'allow', result, traceparent: traceOut, trace };
  }
  const e = body?.error;
  if (e?.code === -32004 || e?.code === -32003) {
    const d = e.data ?? {};
    return {
      outcome: e.code === -32004 ? 'hold' : 'deny', rule: d.rule, reason: d.reason, rules: d.rules,
      ...(d.approvalId ? { approvalId: d.approvalId, approvers: d.approvers } : {}), traceparent: traceOut, trace,
    };
  }
  return { outcome: 'error', reason: e?.message || `Unexpected reply (HTTP ${res.status}).`, traceparent: traceOut, trace };
}
