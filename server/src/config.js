// All settings come from env (a repo-root .env is loaded in index.js). Everything is loopback-only by default.
export function config(env = process.env) {
  return {
    port: Number(env.PORT) || 6700,
    // Persona names the stub issuer knows. Provisional until the Privilege demo's utility pack lands.
    personas: (env.PERSONAS || 'mark,mary,priya,dana').split(',').map((s) => s.trim()).filter(Boolean),
    host: env.HOST || '127.0.0.1',
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
      if (!['http:', 'https:'].includes(new URL(v).protocol)) problems.push(`${k} must be http(s)`);
    } catch { problems.push(`${k} is not a valid URL`); }
  }
  return problems;
}
