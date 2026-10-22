import { assertBindAllowed, isLoopbackHost } from './safety.js';

// All settings come from env (a repo-root .env is loaded in index.js). Everything is loopback-only by default.
export function config(env = process.env) {
  const mock = env.MODE === 'mock';
  return {
    // local = the real Privilege demo and its stub issuer (loopback or listed hosts). mock = everything in-process, hosted-safe.
    mode: env.MODE === undefined || env.MODE === '' ? 'local' : env.MODE,
    hosted: env.WORKER_HOSTED === '1',
    // The one extra Origin host a write may come from: the SE host the ingress serves (the ingress rewrites Host to loopback).
    allowedOriginHost: (env.ALLOWED_ORIGIN_HOST || '').toLowerCase(),
    workspaceId: env.WORKSPACE_ID || 'default',
    port: Number(env.PORT) || 6700,
    // Persona names the stub issuer knows. The utility pack's people (invented): eli, gwen, ben, cora, priya (the approver).
    personas: (env.PERSONAS || 'eli,gwen,ben,cora,priya').split(',').map((s) => s.trim()).filter(Boolean),
    host: env.HOST || '127.0.0.1',
    // Hosts besides loopback that this server may call (a container reaching the Privilege demo by name). Nothing else leaves.
    allowedHosts: (env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    // The Privilege demo's MCP door. Every agent tool call goes through it.
    pepUrl: mock ? 'http://mock.invalid/mcp' : env.PEP_URL || 'http://127.0.0.1:4510/mcp',
    // Mock mode: the Privilege demo stack's stub issuer (not PingFederate). Loopback only.
    mintUrl: mock ? 'http://mock.invalid/mint' : env.MINT_URL || 'http://127.0.0.1:9031/mint',
  };
}

export function startupProblems(cfg) {
  const problems = [];
  if (!['local', 'mock'].includes(cfg.mode)) problems.push('MODE must be local or mock');
  if (!/^[a-z0-9-]{1,32}$/.test(cfg.workspaceId)) problems.push('WORKSPACE_ID must be 1-32 chars of a-z, 0-9, -');
  if (cfg.hosted && cfg.mode !== 'mock') problems.push('WORKER_HOSTED=1 requires MODE=mock: a hosted build never reaches a real stack');
  if (cfg.mode === 'mock') return problems; // nothing else is reachable in mock mode, so no PEP/issuer host to check
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) problems.push('PORT must be 1-65535');
  for (const [k, v] of [['PEP_URL', cfg.pepUrl], ['MINT_URL', cfg.mintUrl]]) {
    try {
      const u = new URL(v);
      if (!['http:', 'https:'].includes(u.protocol)) problems.push(`${k} must be http(s)`);
      else if (!isLoopbackHost(u.hostname) && !cfg.allowedHosts.includes(u.hostname.toLowerCase())) problems.push(`${k} host ${u.hostname} is not loopback; list it in ALLOWED_HOSTS on purpose`);
    } catch { problems.push(`${k} is not a valid URL`); }
  }
  try { assertBindAllowed(cfg.host); } catch (e) { problems.push(e.message); }
  return problems;
}
