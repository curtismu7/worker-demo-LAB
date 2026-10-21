import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { isLoopbackHost } from '../src/safety.js';
import { loadCustomer, DEFAULTS } from '../src/customer.js';

const app = () => createApp({ cfg: config({}) });

describe('safety middleware', () => {
  it('refuses a non-loopback Host header (DNS rebinding)', async () => {
    const res = await request(app()).get('/api/health').set('Host', 'evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('bad_host');
  });
  it('refuses a cross-origin write and a cross-site fetch, allows same-origin', async () => {
    const a = app();
    expect((await request(a).post('/api/reset').set('Origin', 'http://evil.example').send({})).status).toBe(403);
    expect((await request(a).post('/api/reset').set('Sec-Fetch-Site', 'cross-site').send({})).status).toBe(403);
    const ok = await request(a).post('/api/reset').set('Host', '127.0.0.1:6700').set('Origin', 'http://127.0.0.1:6700').send({});
    expect(ok.status).toBe(200);
  });
  it('knows loopback names', () => {
    for (const h of ['localhost', '127.0.0.1', '::1', '[::1]']) expect(isLoopbackHost(h)).toBe(true);
    for (const h of ['0.0.0.0', 'example.com', '10.0.0.1']) expect(isLoopbackHost(h)).toBe(false);
  });
});

describe('customer.config', () => {
  it('falls back to the neutral utility default when the file is missing', () => {
    expect(loadCustomer('/nonexistent/customer.config.json')).toEqual({ ...DEFAULTS });
  });
  it('reads only known keys and strips control characters', async () => {
    const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-')), 'c.json');
    fs.writeFileSync(f, JSON.stringify({ brand: { name: 'Acme\u0007 Power' }, vertical: 'utility', evil: '<script>', vocabulary: { person: 'Engineer' } }));
    const c = loadCustomer(f);
    expect(c.brand.name).toBe('Acme  Power');
    expect(c.vocabulary).toEqual({ person: 'Engineer', agent: 'Agent' });
    expect(c).not.toHaveProperty('evil');
  });
});

describe('channels, customer and reset endpoints', () => {
  it('lists the five channels from the requirements sheet', async () => {
    const res = await request(app()).get('/api/channels');
    expect(res.body.channels.map((c) => c.id)).toEqual(['teams', 'github', 'cowork', 'website', 'hr-chatbot']);
  });
  it('serves the customer config', async () => {
    expect((await request(app()).get('/api/customer')).body.brand.name).toBeTruthy();
  });
});
