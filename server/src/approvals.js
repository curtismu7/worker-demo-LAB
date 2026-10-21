// Decides a held call through the Privilege demo's approvals API (privilege-demo app.js: POST /api/approvals/:id/approve|deny,
// 403 not_an_approver, 409 already_decided/expired, 404 not_found). Sent as the approver's Bearer token. UNVERIFIED against the real
// stack: that API also takes a session cookie, and whether it accepts a Bearer alone has not been exercised from here.
export async function decideApproval({ pepUrl, token, approvalId, verb, fetchImpl = fetch }) {
  if (typeof approvalId !== 'string' || !/^[\w-]{1,64}$/.test(approvalId)) return { ok: false, error: 'bad_approval_id', reason: 'The held call has no usable approval id.' };
  const url = new URL(`/api/approvals/${approvalId}/${verb}`, pepUrl);
  let res;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) });
  } catch { return { ok: false, error: 'pep_down', reason: 'The Privilege demo did not answer.' }; }
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  const REASON = {
    not_an_approver: 'That person is not an approver for this call (and nobody can approve their own).',
    already_decided: 'Already decided.', expired: 'The approval expired.', not_found: 'The approval was not found for this approver.',
  };
  return { ok: false, error: body.error || `http_${res.status}`, reason: REASON[body.error] || `The Privilege demo refused (HTTP ${res.status}).` };
}
