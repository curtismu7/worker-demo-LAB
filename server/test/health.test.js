import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config, startupProblems } from '../src/config.js';

describe('GET /api/health', () => {
  it('answers demo-health/1 with no-store', async () => {
    const res = await request(createApp({ cfg: config({}), now: () => new Date('2026-10-21T12:00:00Z') })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      schema: 'demo-health/1', at: '2026-10-21T12:00:00.000Z', state: 'ready', runtime: 'offline',
      demo: { id: 'worker-demo', name: 'Worker Agent Demo', version: '0.1.0' },
    });
    expect(JSON.stringify(res.body).length).toBeLessThan(4096);
  });
});

describe('config', () => {
  it('defaults to loopback on 6700, inside the claimed range', () => {
    const cfg = config({});
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.port).toBe(6700);
    expect(startupProblems(cfg)).toEqual([]);
  });
  it('rejects a bad port and a non-http PEP_URL', () => {
    expect(startupProblems(config({ PORT: '99999' }))).toContain('PORT must be 1-65535');
    expect(startupProblems(config({ PEP_URL: 'file:///etc/passwd' }))).toContain('PEP_URL must be http(s)');
  });
});
