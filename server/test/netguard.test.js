import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { installNetguard, netguardSelfTest } from '../src/netguard.js';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';

describe('netguard', () => {
  it('self-test: every route out is refused and recorded', async () => {
    const r = await netguardSelfTest();
    expect(r.ok).toBe(true);
    expect(r.blocked).toBe(6);
    installNetguard().restore();
  });

  it('an outbound attempt to an unlisted host is refused; a listed host passes the guard', async () => {
    const g = installNetguard({ allow: ['pep.internal.example'] });
    await expect(fetch('https://other.example/', { signal: AbortSignal.timeout(1500) })).rejects.toThrow(/network blocked/);
    expect(g.attempts).toContain('fetch:other.example');
    // The listed host is not blocked by the guard (it fails later, at DNS or connect, which is not a 'network blocked' error).
    await expect(fetch('http://pep.internal.example:1/', { signal: AbortSignal.timeout(1500) })).rejects.not.toThrow(/network blocked/);
    g.restore();
  });

  it('a full run makes zero outbound attempts (everything goes through the injected fetch)', async () => {
    const g = installNetguard();
    const jwt = `h.${Buffer.from(JSON.stringify({ sub: 'p' })).toString('base64url')}.s`;
    const fetchImpl = async (url) => (String(url).endsWith('/mint')
      ? { ok: true, status: 200, json: async () => ({ access_token: jwt }) }
      : { status: 200, headers: { get: () => null }, json: async () => ({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{}' }] } }) });
    const res = await request(createApp({ cfg: config({}), fetchImpl })).post('/api/runs').send({ scenario: 'code-review', persona: 'p' });
    expect(res.status).toBe(201);
    expect(g.attempts).toEqual([]);
    g.restore();
  });
});
