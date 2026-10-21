import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { config, startupProblems } from './config.js';

try { process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url))); } catch { /* no .env */ }

const cfg = config();
const problems = startupProblems(cfg);
if (problems.length) {
  for (const p of problems) console.error(`[worker-demo] refusing to start: ${p}`);
  process.exit(1);
}
createApp({ cfg }).listen(cfg.port, cfg.host, () => console.log(`[worker-demo] listening on http://${cfg.host}:${cfg.port}`));
