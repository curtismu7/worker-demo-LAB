// Calls the Privilege demo's MCP door (JSON-RPC tools/call over POST, Bearer token) and turns the reply into one outcome.
// Contract (privilege-demo app.js): result -> allow; error -32004 -> hold (data.approvalId); error -32003 -> deny. HTTP 401 -> unauthenticated.
export async function callTool({ url, token, name, args, id = 1, traceparent, fetchImpl = fetch, timeoutMs = 5000 }) {
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(traceparent ? { traceparent } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args ?? {} } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch { return { outcome: 'error', reason: 'The Privilege demo did not answer. Start it or set PEP_URL.' }; }

  const traceOut = res.headers?.get?.('traceparent') ?? undefined;
  if (res.status === 401) return { outcome: 'error', reason: 'The Privilege demo rejected the token (401).', traceparent: traceOut };
  let body;
  try { body = await res.json(); } catch { return { outcome: 'error', reason: `Unreadable reply (HTTP ${res.status}).`, traceparent: traceOut }; }

  if (body?.result) {
    let result = body.result;
    try { result = JSON.parse(body.result.content?.[0]?.text); } catch { /* keep raw */ }
    return { outcome: 'allow', result, traceparent: traceOut };
  }
  const e = body?.error;
  if (e?.code === -32004 || e?.code === -32003) {
    const d = e.data ?? {};
    return {
      outcome: e.code === -32004 ? 'hold' : 'deny', rule: d.rule, reason: d.reason, rules: d.rules,
      ...(d.approvalId ? { approvalId: d.approvalId, approvers: d.approvers } : {}), traceparent: traceOut,
    };
  }
  return { outcome: 'error', reason: e?.message || `Unexpected reply (HTTP ${res.status}).`, traceparent: traceOut };
}
