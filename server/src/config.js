// All settings come from env (a repo-root .env is loaded in index.js). Everything is loopback-only by default.
export function config(env = process.env) {
  return {
    port: Number(env.PORT) || 6700,
    host: env.HOST || '127.0.0.1',
    // The Privilege demo's MCP door. Every agent tool call goes through it.
    pepUrl: env.PEP_URL || 'http://127.0.0.1:4510/mcp',
  };
}

export function startupProblems(cfg) {
  const problems = [];
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) problems.push('PORT must be 1-65535');
  try {
    const u = new URL(cfg.pepUrl);
    if (!['http:', 'https:'].includes(u.protocol)) problems.push('PEP_URL must be http(s)');
  } catch { problems.push('PEP_URL is not a valid URL'); }
  return problems;
}
