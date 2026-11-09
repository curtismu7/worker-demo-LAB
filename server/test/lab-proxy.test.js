// The family lab-proxy (launcher at https://local.ping-devops.com:8443) sends Host `<name>:<port>` for this lab, plus
// X-Forwarded-Host/-Proto; the browser's Origin on a write is the launcher's. LAB_ALLOWED_HOSTS names the lab; loopback
// always works and never vouches for forwarded headers.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { labProxyHosts } from '../src/safety.js';

const NAME = 'worker-demo.local.ping-devops.com';
const LAUNCHER = 'https://local.ping-devops.com:8443';
const PROXIED = { Host: `${NAME}:6700`, 'X-Forwarded-Host': 'local.ping-devops.com:8443', 'X-Forwarded-Proto': 'https' };
const app = (env = { LAB_ALLOWED_HOSTS: NAME }) => createApp({ cfg: config(env) });
const write = (a, headers) => request(a).post('/api/reset').set(headers).send({});

describe('lab-proxy (LAB_ALLOWED_HOSTS)', () => {
  it('parses LAB_ALLOWED_HOSTS into <name>:<port> Hosts; unset means none (loopback only)', () => {
    expect([...config({}).proxyHosts]).toEqual([]);
    expect([...labProxyHosts({ LAB_ALLOWED_HOSTS: ` ${NAME.toUpperCase()} , ,other.example ` }, 6700)]).toEqual([`${NAME}:6700`, 'other.example:6700']);
    expect([...config({ LAB_ALLOWED_HOSTS: NAME, PORT: '6701' }).proxyHosts]).toEqual([`${NAME}:6701`]);
  });
  it('accepts the launcher Host for GET /api/health', async () => {
    const res = await request(app()).get('/api/health').set(PROXIED);
    expect(res.status).toBe(200);
  });
  it('accepts a proxied same-origin write (Origin === X-Forwarded-Proto://X-Forwarded-Host)', async () => {
    const res = await write(app(), { ...PROXIED, Origin: LAUNCHER, 'Sec-Fetch-Site': 'same-origin' });
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });
  it('refuses a foreign or mismatched Origin on the launcher Host', async () => {
    const a = app();
    for (const origin of ['https://evil.example', 'http://local.ping-devops.com:8443', 'https://local.ping-devops.com']) {
      expect((await write(a, { ...PROXIED, Origin: origin })).status).toBe(403);
    }
    expect((await write(a, { ...PROXIED, 'X-Forwarded-Proto': 'ftp', Origin: 'ftp://local.ping-devops.com:8443' })).status).toBe(403);
  });
  it('ignores forwarded headers on a loopback Host', async () => {
    const a = app();
    for (const host of ['127.0.0.1:6700', 'localhost:6700']) {
      expect((await write(a, { Host: host, 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'https', Origin: 'https://evil.example' })).status).toBe(403);
      expect((await write(a, { Host: host, 'X-Forwarded-Host': 'local.ping-devops.com:8443', 'X-Forwarded-Proto': 'https', Origin: LAUNCHER })).status).toBe(403);
    }
  });
  it('refuses a Host outside the set, and the launcher Host when LAB_ALLOWED_HOSTS is unset', async () => {
    const a = app();
    for (const host of ['local.ping-devops.com:6700', 'local.ping-devops.com:8443', 'evil.example:6700', `${NAME}:1`, NAME]) {
      const res = await request(a).get('/api/health').set({ ...PROXIED, Host: host });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('bad_host');
    }
    expect((await request(app({})).get('/api/health').set(PROXIED)).status).toBe(403);
  });
});
