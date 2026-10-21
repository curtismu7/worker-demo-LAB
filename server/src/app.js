import express from 'express';

export const DEMO = { id: 'worker-demo', name: 'Worker Agent Demo', version: '0.1.0' };

export function createApp({ cfg, now = () => new Date() }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // demo-health/1 (see demo-shelf docs/health-contract.md): public, GET only, no detail.
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ schema: 'demo-health/1', at: now().toISOString(), state: 'ready', runtime: 'offline', demo: DEMO });
  });

  return app;
}
