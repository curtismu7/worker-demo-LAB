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

// The family lab-proxy (https://local.ping-devops.com:8443) sends Host `<name>:<this lab's port>` for a name listed in
// LAB_ALLOWED_HOSTS (a comma list of host names, no ports). Loopback always works; unset means loopback only. config()
// parses it (index.js calls config() before the server starts).
export function labProxyHosts(env, port) {
  return new Set(String(env.LAB_ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).map((n) => `${n}:${port}`));
}

// Behind the lab-proxy the browser's Origin is the proxy's (https://local.ping-devops.com:8443) while Host is this lab's own
// name. X-Forwarded-Host/-Proto are believed only when Host is one of proxyHosts (never loopback), so a request that did not
// come through the proxy cannot use them.
export function isProxiedSameOrigin(headers, proxyHosts) {
  const xfh = String(headers['x-forwarded-host'] || '').trim().toLowerCase();
  const xfp = String(headers['x-forwarded-proto'] || '').trim().toLowerCase();
  return proxyHosts.has(String(headers.host || '').toLowerCase()) && xfh !== '' && (xfp === 'https' || xfp === 'http')
    && headers.origin === `${xfp}://${xfh}`;
}

export function makeHostCheck(proxyHosts = new Set()) {
  return function hostCheck(req, res, next) {
    const raw = String(req.headers.host || '');
    const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.replace(/:\d+$/, '');
    if (!isLoopbackHost(host) && !proxyHosts.has(raw.toLowerCase())) return res.status(403).json({ error: 'bad_host', message: 'Host must be a loopback name' });
    next();
  };
}
export const hostCheck = makeHostCheck();

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// `extraHost`: the one other host an Origin may name (the hosted build's public host; the ingress rewrites Host to loopback).
export const sameOriginWrites = (extraHost = '', proxyHosts = new Set()) => (req, res, next) => {
  if (!WRITE.has(req.method)) return next();
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ error: 'cross_origin', message: 'writes must be same-origin' });
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try { const h = new URL(origin).host.toLowerCase(); ok = h === String(req.headers.host).toLowerCase() || (extraHost !== '' && h === extraHost); } catch { /* malformed */ }
    if (!ok && !isProxiedSameOrigin(req.headers, proxyHosts)) return res.status(403).json({ error: 'cross_origin', message: 'writes must be same-origin' });
  }
  next();
}
