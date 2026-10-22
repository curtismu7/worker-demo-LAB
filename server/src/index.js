import { fileURLToPath } from 'node:url';
import { installNetguard } from './netguard.js';
import { createApp } from './app.js';
import { config, startupProblems } from './config.js';

try { process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url))); } catch { /* no .env */ }

const cfg = config();
// Before anything else can open a socket: only loopback and the hosts configured on purpose are reachable.
installNetguard({ allow: cfg.allowedHosts });
const problems = startupProblems(cfg);
if (problems.length) {
  for (const p of problems) console.error(`[worker-demo] refusing to start: ${p}`);
  process.exit(1);
}
createApp({ cfg }).listen(cfg.port, cfg.host, () => console.log(`[worker-demo] listening on http://${cfg.host}:${cfg.port} (MODE=${process.env.MODE ?? 'local'}${cfg.hosted ? ', hosted' : ''}, workspace ${cfg.mode === 'mock' ? 'per session' : cfg.workspaceId})`));
