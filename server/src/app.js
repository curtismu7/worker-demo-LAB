import express from 'express';
import { createRunner } from './runs.js';
import { listScenarios } from './scenarios.js';

export const DEMO = { id: 'worker-demo', name: 'Worker Agent Demo', version: '0.1.0' };

export function createApp({ cfg, now = () => new Date(), fetchImpl = fetch }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // demo-health/1 (see demo-shelf docs/health-contract.md): public, GET only, no detail.
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ schema: 'demo-health/1', at: now().toISOString(), state: 'ready', runtime: 'offline', demo: DEMO });
  });

  const runner = createRunner({ cfg, now, fetchImpl });
  // Mock sign-in: the persona names come from the Privilege demo's stub issuer. No token ever appears in a response.
  app.get('/api/scenarios', (_req, res) => res.json({ scenarios: listScenarios() }));
  app.get('/api/runs', (_req, res) => res.json({ runs: runner.list() }));
  app.get('/api/runs/:id', (req, res) => { const r = runner.get(req.params.id); return r ? res.json(r) : res.status(404).json({ error: 'not_found' }); });
  app.post('/api/runs', async (req, res, next) => {
    const { scenario, persona } = req.body ?? {};
    if (typeof scenario !== 'string' || typeof persona !== 'string') return res.status(400).json({ error: 'scenario_and_persona_required' });
    try { return res.status(201).json(await runner.start({ scenario, persona })); } catch (e) {
      if (e.code === 'unknown_scenario') return res.status(400).json({ error: e.code });
      if (e.code === 'issuer_down' || e.code === 'mint_failed') return res.status(502).json({ error: e.code, reason: e.message });
      return next(e);
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    return res.status(500).json({ error: 'internal_error' });
  });
  return app;
}
