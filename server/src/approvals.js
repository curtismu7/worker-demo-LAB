// Decides a held call through the Privilege demo's approvals API (privilege-demo app.js: POST /api/approvals/:id/approve|deny,
// 403 not_an_approver, 409 already_decided/expired, 404 not_found). Sent as the approver's Bearer token (VERIFIED 2026-10-21 against the
// real utility pack: a Bearer alone is accepted; the owner of the held call is refused with 403). A successful approve returns the
// approval record whose `outcome` says whether the held call ran (executed, result).
import { approvalTrace } from './workerTrace.js';

// Every outcome that made a call also carries `trace` (Rule 25): the request, the reply and the decisions.
export async function decideApproval({ pepUrl, token, approvalId, verb, fetchImpl = fetch }) {
  if (typeof approvalId !== 'string' || !/^[\w-]{1,64}$/.test(approvalId)) return { ok: false, error: 'bad_approval_id', reason: 'The held call has no usable approval id.' };
  const url = new URL(`/api/approvals/${approvalId}/${verb}`, pepUrl);
  let res;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) });
  } catch (e) { return { ok: false, error: 'pep_down', reason: 'The Privilege demo did not answer.', trace: approvalTrace({ url, token, verb, error: e?.message }) }; }
  if (res.ok) { const record = await res.json().catch(() => null); return { ok: true, record, trace: approvalTrace({ url, token, verb, res, body: record }) }; }
  const body = await res.json().catch(() => ({}));
  const trace = approvalTrace({ url, token, verb, res, body });
  const REASON = {
    not_an_approver: 'That person is not an approver for this call (and nobody can approve their own).',
    already_decided: 'Already decided.', expired: 'The approval expired.', not_found: 'The approval was not found for this approver.',
  };
  return { ok: false, error: body.error || `http_${res.status}`, reason: REASON[body.error] || `The Privilege demo refused (HTTP ${res.status}).`, trace };
}
