// Preflight: Node version, port free, Privilege demo (the PEP) reachable. Prints pass/fail lines only. Exit 1 on a failure.
// `--skip-pep` skips the Privilege demo check (CI has no such stack; `npm run smoke` is the check that needs it).
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch { /* optional */ }

let failed = 0;
const report = (ok, name, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};

const { config, startupProblems } = await import(pathToFileURL(path.join(root, 'server/src/config.js')));
const cfg = config();
const major = Number(process.versions.node.split('.')[0]);
report(major >= 20, 'Node version', `v${process.versions.node} (need >= 20)`);
for (const p of startupProblems(cfg)) report(false, 'configuration', `${p}. Fix it in .env`);

await new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', (e) => { report(false, 'port free', `${cfg.port} (${e.code}). Set PORT in .env to a free port`); resolve(); });
  s.listen(cfg.port, cfg.host, () => s.close(() => { report(true, 'port free', String(cfg.port)); resolve(); }));
});

if (process.argv.includes('--skip-pep')) console.log('INFO  Privilege demo check skipped (--skip-pep)');
else try {
  const health = new URL('/api/health', cfg.pepUrl);
  const res = await fetch(health, { signal: AbortSignal.timeout(3000) });
  report(res.ok, 'Privilege demo reachable', res.ok ? health.origin : `HTTP ${res.status}`);
} catch { report(false, 'Privilege demo reachable', `no answer at ${cfg.pepUrl}. Start privilege-demo or set PEP_URL`); }

if (failed) { console.log(`\n${failed} check(s) failed.`); process.exit(1); }
