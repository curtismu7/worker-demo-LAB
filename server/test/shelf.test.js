import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';

// The header "Shelf" button needs GET /api/shelf to be reachable. Tests run with no web build (server/../web/dist), which is the case that hid it.
describe('GET /api/shelf', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('returns SHELF_URL with the trailing slash trimmed, with no web build, and a POST is refused', async () => {
    vi.stubEnv('SHELF_URL', 'https://shelf.example:8443/');
    const app = createApp({ cfg: config({}) });
    const res = await request(app).get('/api/shelf');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ shelfUrl: 'https://shelf.example:8443' });
    expect((await request(app).post('/api/shelf').send({})).status).not.toBe(200);
  });
});
