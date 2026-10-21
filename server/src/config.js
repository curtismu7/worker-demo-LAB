import { assertBindAllowed, isLoopbackHost } from './safety.js';

// All settings come from env (a repo-root .env is loaded in index.js). Everything is loopback-only by default.
export function config(env = process.env) {
  return {
    port: Number(env.PORT) || 6700,
    // Persona names the stub issuer knows. Provisional until the Privilege demo's utility pack lands.
    personas: (env.PERSONAS || 'mark,mary,priya,dana').split(',').map((s) => s.trim()).filter(Boolean),
    host: env.HOST || '127.0.0.1',
    // Hosts besides loopback that this server may call (a container reaching the Privilege demo by name). Nothing else leaves.
    allowedHosts: (env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    // The Privilege demo's MCP door. Every agent tool call goes through it.
    pepUrl: env.PEP_URL || 'http://127.0.0.1:4510/mcp',
    // Mock mode: the Privilege demo stack's stub issuer (not PingFederate). Loopback only.
    mintUrl: env.MINT_URL || 'http://127.0.0.1:9031/mint',
  };
}

export function startupProblems(cfg) {
  const problems = [];
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
