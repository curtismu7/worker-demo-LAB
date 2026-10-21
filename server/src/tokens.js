// Mock-mode token source: asks the Privilege demo's local stub issuer (NOT PingFederate) for a persona token, loopback only.
// The raw token never leaves the server; claimSummary() is all a response may show.
export async function mintToken({ mintUrl, persona, act, groups, scope, fetchImpl = fetch }) {
  let res;
  try {
    res = await fetchImpl(mintUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona, act, groups, scope }), signal: AbortSignal.timeout(3000),
    });
  } catch { throw Object.assign(new Error('The stub issuer did not answer. Start the Privilege demo stack.'), { code: 'issuer_down' }); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw Object.assign(new Error(j.error || `mint failed (HTTP ${res.status})`), { code: 'mint_failed' });
  return j.access_token;
}

// Decoded (not verified) claims safe to show: who the token is for, who acts, and groups. Never the token itself.
export function claimSummary(token) {
  try {
    const c = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return { sub: c.sub, act: c.act?.sub ?? null, groups: c.groups ?? [], scope: c.scope ?? null, aud: c.aud ?? null, exp: c.exp ?? null };
  } catch { return null; }
}
