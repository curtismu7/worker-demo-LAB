import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { createWorkspaces } from './workspaces.js';
import { listScenarios } from './scenarios.js';
import { CHANNELS } from './channels.js';
import { loadCustomer } from './customer.js';
import { hostCheck, sameOriginWrites } from './safety.js';

export const DEMO = { id: 'worker-demo', name: 'Worker Agent Demo', version: '0.3.0' };

export function createApp({ cfg, now = () => new Date(), fetchImpl }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(hostCheck);
  app.use(sameOriginWrites(cfg.allowedOriginHost));
  app.use(express.json({ limit: '100kb' }));
  const customer = loadCustomer();

  // demo-health/1 (see demo-shelf docs/health-contract.md): public, GET only, no detail.
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ schema: 'demo-health/1', at: now().toISOString(), state: 'ready', runtime: 'offline', demo: DEMO });
  });

  // Rule 13: every request runs in a workspace. Hosted mock mode: one per browser session (a random cookie, nothing personal in it).
  // Local mode: the single configured workspace. The cookie only selects in-memory state; it grants nothing.
  const workspaces = createWorkspaces({ cfg, fetchImpl, now });
  const COOKIE = /(?:^|;\s*)ws=([a-f0-9]{32})(?:;|$)/;
  app.use('/api', (req, res, next) => {
    let workspaceId = cfg.workspaceId;
    if (cfg.mode === 'mock') {
      workspaceId = COOKIE.exec(req.headers.cookie ?? '')?.[1];
      if (!workspaceId) {
        workspaceId = randomBytes(16).toString('hex');
        res.append('Set-Cookie', `ws=${workspaceId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200${cfg.hosted ? '; Secure' : ''}`);
      }
    }
    req.runner = workspaces.get(workspaceId);
    next();
  });
  // What this build is: the banner and the deploy check read it (verify by content, not by a 200).
  // Rule 19: source + realAvailable; Real = the local Privilege demo's MCP door (PEP) and stub issuer.
  const realAvailable = () => {
    for (const u of [cfg.pepUrl, cfg.mintUrl]) {
      try { const x = new URL(u); if (!['http:', 'https:'].includes(x.protocol)) return false; } catch { return false; }
    }
    return true;
  };
  app.get('/api/info', (_req, res) => res.json({
    mode: cfg.mode, hosted: cfg.hosted, simulated: cfg.mode === 'mock',
    workspaceId: cfg.mode === 'mock' ? 'per-session' : cfg.workspaceId,
    source: cfg.mode === 'mock' ? 'mock' : 'real',
    realAvailable: realAvailable(),
  }));
  // Rule 19: POST /api/mode {source:"mock"|"real"} switches at runtime. Real requires the PEP and issuer URLs to be
  // real URLs (loopback or deliberately allowed); 409 otherwise. A switch keeps each workspace's history.
  app.post('/api/mode', (req, res) => {
    const b = req.body;
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length !== 1 || !['mock', 'real'].includes(b.source)) {
      return res.status(400).json({ error: 'bad_body', message: 'body must be exactly {"source": "mock" or "real"}' });
    }
    const mode = b.source === 'real' ? 'local' : 'mock';
    if (mode === 'local' && !realAvailable()) {
      return res.status(409).json({ error: 'conflict', message: 'Real mode is not available: set PEP_URL and MINT_URL (the Privilege demo door and its stub issuer) in the shared settings file.' });
    }
    cfg.mode = mode;
    return res.json({ source: b.source });
  });
  // Mock sign-in: the persona names come from the Privilege demo's stub issuer. No token ever appears in a response.
  app.get('/api/personas', (_req, res) => res.json({ personas: cfg.personas }));
  app.get('/api/customer', (_req, res) => res.json(customer));
  app.get('/api/channels', (_req, res) => res.json({ channels: CHANNELS }));
  app.post('/api/reset', (req, res) => res.json(req.runner.reset()));
  app.get('/api/scenarios', (_req, res) => res.json({ scenarios: listScenarios() }));
  app.get('/api/arm', (req, res) => res.json(req.runner.armStatus()));
  app.post('/api/arm', (req, res) => (typeof req.body?.armed === 'boolean' ? res.json(req.runner.arm(req.body.armed)) : res.status(400).json({ error: 'armed_boolean_required' })));
  app.post('/api/kill', (req, res) => res.json(req.runner.kill()));
  app.get('/api/runs', (req, res) => res.json({ runs: req.runner.list() }));
  app.get('/api/runs/:id', (req, res) => { const r = req.runner.get(req.params.id); return r ? res.json(r) : res.status(404).json({ error: 'not_found' }); });
  app.post('/api/runs/:id/resolve', async (req, res, next) => {
    const { decision, approver } = req.body ?? {};
    if (typeof decision !== 'string' || (approver !== undefined && typeof approver !== 'string')) return res.status(400).json({ error: 'decision_required' });
    try { return res.json(await req.runner.resolve(req.params.id, { decision, approver })); } catch (e) {
      if (e.code === 'not_found') return res.status(404).json({ error: e.code });
      if (e.code === 'not_parked') return res.status(409).json({ error: e.code, reason: e.message });
      if (e.code === 'bad_decision') return res.status(400).json({ error: e.code, reason: e.message });
      if (e.code === 'issuer_down' || e.code === 'mint_failed' || e.code === 'pep_down') return res.status(502).json({ error: e.code, reason: e.message });
      if (e.code) return res.status(403).json({ error: e.code, reason: e.message }); // the Privilege demo refused the approver
      return next(e);
    }
  });
  app.post('/api/runs', async (req, res, next) => {
    const { scenario, persona } = req.body ?? {};
    if (typeof scenario !== 'string' || (persona != null && typeof persona !== 'string')) return res.status(400).json({ error: 'scenario_and_persona_required' });
    try { return res.status(201).json(await req.runner.start({ scenario, persona })); } catch (e) {
      if (e.code === 'unknown_scenario' || e.code === 'persona_required') return res.status(400).json({ error: e.code });
      if (e.code === 'disarmed') return res.status(403).json({ error: e.code, reason: e.message });
      if (e.code === 'issuer_down' || e.code === 'mint_failed') return res.status(502).json({ error: e.code, reason: e.message });
      return next(e);
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    return res.status(500).json({ error: 'internal_error' });
  });
  return app;
}
