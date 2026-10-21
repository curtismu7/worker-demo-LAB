import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createRunner } from './runs.js';
import { listScenarios } from './scenarios.js';
import { CHANNELS } from './channels.js';
import { loadCustomer } from './customer.js';
import { hostCheck, sameOriginWrites } from './safety.js';

export const DEMO = { id: 'worker-demo', name: 'Worker Agent Demo', version: '0.2.0' };

export function createApp({ cfg, now = () => new Date(), fetchImpl = fetch }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(hostCheck);
  app.use(sameOriginWrites);
  app.use(express.json({ limit: '100kb' }));
  const customer = loadCustomer();

  // demo-health/1 (see demo-shelf docs/health-contract.md): public, GET only, no detail.
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ schema: 'demo-health/1', at: now().toISOString(), state: 'ready', runtime: 'offline', demo: DEMO });
  });

  const runner = createRunner({ cfg, now, fetchImpl });
  // Mock sign-in: the persona names come from the Privilege demo's stub issuer. No token ever appears in a response.
  app.get('/api/personas', (_req, res) => res.json({ personas: cfg.personas }));
  app.get('/api/customer', (_req, res) => res.json(customer));
  app.get('/api/channels', (_req, res) => res.json({ channels: CHANNELS }));
  app.post('/api/reset', (_req, res) => res.json(runner.reset()));
  app.get('/api/scenarios', (_req, res) => res.json({ scenarios: listScenarios() }));
  app.get('/api/arm', (_req, res) => res.json(runner.armStatus()));
  app.post('/api/arm', (req, res) => (typeof req.body?.armed === 'boolean' ? res.json(runner.arm(req.body.armed)) : res.status(400).json({ error: 'armed_boolean_required' })));
  app.post('/api/kill', (_req, res) => res.json(runner.kill()));
  app.get('/api/runs', (_req, res) => res.json({ runs: runner.list() }));
  app.get('/api/runs/:id', (req, res) => { const r = runner.get(req.params.id); return r ? res.json(r) : res.status(404).json({ error: 'not_found' }); });
  app.post('/api/runs/:id/resolve', async (req, res, next) => {
    const { decision, approver } = req.body ?? {};
    if (typeof decision !== 'string' || (approver !== undefined && typeof approver !== 'string')) return res.status(400).json({ error: 'decision_required' });
    try { return res.json(await runner.resolve(req.params.id, { decision, approver })); } catch (e) {
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
    if (typeof scenario !== 'string' || typeof persona !== 'string') return res.status(400).json({ error: 'scenario_and_persona_required' });
    try { return res.status(201).json(await runner.start({ scenario, persona })); } catch (e) {
      if (e.code === 'unknown_scenario') return res.status(400).json({ error: e.code });
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
