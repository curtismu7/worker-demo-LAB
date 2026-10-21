#!/usr/bin/env node
// Reset a running worker demo: forgets every run and disarms the unattended lane.
//   node scripts/reset.mjs [base-url]      (default http://127.0.0.1:${PORT:-6700})
// Loopback only: refuses any other host. Needs the server already running; sends the same-origin header the server requires.
import { isLoopbackHost } from '../server/src/safety.js';

export async function reset(base = `http://127.0.0.1:${process.env.PORT || 6700}`) {
  const u = new URL(base);
  if (!isLoopbackHost(u.hostname)) throw new Error(`refusing ${u.hostname}: loopback only`);
  const r = await fetch(new URL('/api/reset', u), { method: 'POST', headers: { 'content-type': 'application/json', origin: u.origin }, body: '{}' });
  if (!r.ok) throw new Error(`reset failed: HTTP ${r.status}`);
  return r.json();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  reset(process.argv[2]).then((j) => console.log(`reset: ${j.reset}`), (e) => { console.error(e.message); process.exit(1); });
}
