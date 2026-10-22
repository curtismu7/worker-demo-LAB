// Safety rules (pattern copied from agent-registry-demo; nothing imported across repos). Pure functions plus two tiny middlewares.
//  1. Loopback bind only unless WORKER_BIND_ALL is set on purpose (the container sets it; compose publishes on 127.0.0.1 only).
//  2. Host header must be a loopback name (DNS-rebinding defence).
//  3. A write must be same-origin: a cross-origin Origin, or a cross-site Sec-Fetch-Site, is refused.

export function isLoopbackHost(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127(\.\d{1,3}){3}$/.test(h);
}

export function assertBindAllowed(host, env = process.env) {
  if (isLoopbackHost(host) || env.WORKER_BIND_ALL) return host;
  throw new Error(`refusing to bind ${host}: loopback only. Set WORKER_BIND_ALL to opt in (the container does; compose publishes on 127.0.0.1 only).`);
}

// Free text from a caller (custodian, description): control characters stripped, length capped. Rendered as text, never as markup.
export function cleanText(value, max = 80) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, ' ').trim().slice(0, max);
}

export function hostCheck(req, res, next) {
  const raw = String(req.headers.host || '');
  const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.replace(/:\d+$/, '');
  if (!isLoopbackHost(host)) return res.status(403).json({ error: 'bad_host', message: 'Host must be a loopback name' });
  next();
}

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// `extraHost`: the one other host an Origin may name (the hosted build's public host; the ingress rewrites Host to loopback).
export const sameOriginWrites = (extraHost = '') => (req, res, next) => {
  if (!WRITE.has(req.method)) return next();
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ error: 'cross_origin', message: 'writes must be same-origin' });
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try { const h = new URL(origin).host.toLowerCase(); ok = h === String(req.headers.host).toLowerCase() || (extraHost !== '' && h === extraHost); } catch { /* malformed */ }
    if (!ok) return res.status(403).json({ error: 'cross_origin', message: 'writes must be same-origin' });
  }
  next();
}
