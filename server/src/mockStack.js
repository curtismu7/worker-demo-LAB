// MODE=mock: an in-process stand-in for the Privilege demo (utility pack) and its stub issuer, so the hosted build needs no other
// service. It is a fetch-compatible function: the runner calls it exactly as it calls the real stack (mint, tools/call, approvals).
//
// HONESTY: the decision table below MIRRORS privilege-demo's utility pack (main b3dba08, probed 2026-10-21). It is a copy, not the
// product. `npm run smoke` runs the same checks against this and against the real pack, so drift shows up there. Tokens are unsigned
// (alg none) and only mean something to this function. One instance per workspace: its approvals belong to one visitor.
import { randomUUID } from 'node:crypto';

const REPOS = ['grid-ops-portal', 'outage-notifier', 'meter-data-lake'];
const ENGINEER_REPOS = ['grid-ops-portal', 'outage-notifier'];
const COLLECTIONS = ['runbooks', 'design-notes', 'audit-evidence'];
const LOG_GROUPS = ['portal-app', 'notifier-app', 'security-events'];
const str = { type: 'string' };
const int = { type: 'integer', minimum: 1 };
const en = (values) => ({ type: 'string', enum: values });
const SCHEMAS = {
  'github.read_pr': { repo: en(REPOS), pr: int },
  'github.post_review_comment': { repo: en(REPOS), pr: int, body: str },
  'github.merge_pr': { repo: en(REPOS), pr: int },
  'github.approve_pr': { repo: en(REPOS), pr: int },
  'kb.search': { query: str, collection: en(COLLECTIONS) },
  'cloudwatch.query_logs': { logGroup: en(LOG_GROUPS), query: str },
  'backlog.create_story_draft': { title: str },
  'backlog.update_story': { storyId: str, change: str },
  'confluence.update_requirement': { requirementId: str, change: str },
  'policy.change': { policyId: str, change: str },
  'deploy.staging': { service: str },
  'deploy.production': { service: str },
  'deploy.rollback': { service: str },
};

// The cast (the {{cast.*}} token family: a persona id resolves to the person and their group, as the
// story system in the sibling demos fills {{cast.<id>}} from a vertical). Here the persona is chosen
// in the UI and the group membership drives the policy.
export const PERSONAS = {
  eli: ['engineers'], gwen: ['governance-reviewers'], ben: ['business-analysts'], cora: ['compliance'], priya: ['governance-reviewers'],
};
const APPROVERS = ['priya'];
const AGENT = 'delivery-agent';
const AGENT_GROUPS = ['engineers', 'business-analysts']; // invented, as in the Privilege demo's stub

// group -> tool -> rule id that permits it
const PERMITS = {
  engineers: { 'github.read_pr': 'u10-engineers-pr-review', 'github.post_review_comment': 'u10-engineers-pr-review', 'kb.search': 'u11-engineers-research', 'cloudwatch.query_logs': 'u11-engineers-research' },
  'governance-reviewers': { 'github.read_pr': 'u12-governance-review', 'github.post_review_comment': 'u12-governance-review', 'kb.search': 'u12-governance-review', 'confluence.update_requirement': 'u12-governance-review' },
  'business-analysts': { 'kb.search': 'u13-analysts-backlog', 'backlog.create_story_draft': 'u13-analysts-backlog', 'backlog.update_story': 'u13-analysts-backlog', 'confluence.update_requirement': 'u13-analysts-backlog' },
  compliance: { 'github.read_pr': 'u14-compliance-evidence', 'kb.search': 'u14-compliance-evidence', 'cloudwatch.query_logs': 'u14-compliance-evidence' },
};
const HELD = { 'backlog.update_story': { rule: 'u30-hold-story-update', reason: "Updating an existing story needs a person's approval" }, 'confluence.update_requirement': { rule: 'u31-hold-requirement-update', reason: "Updating a requirement needs a person's approval" } };
const NEVER = (tool) => (/^(github\.merge_pr|github\.approve_pr)$/.test(tool) ? { rule: 'u20-never-merge-or-approve-pr', reason: 'Merging or approving pull requests is never delegated to an agent' }
  : tool === 'policy.change' ? { rule: 'u21-never-change-policy', reason: 'Agents never change policy' }
    : tool.startsWith('deploy.') ? { rule: 'u22-never-deploy', reason: 'Agents never deploy' } : null);

export function argProblems(tool, args) {
  const schema = SCHEMAS[tool];
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const problems = [];
  for (const [k, def] of Object.entries(schema)) {
    if (!(k in a)) { problems.push(`${k} is required`); continue; }
    if (def.type === 'integer' ? !(Number.isInteger(a[k]) && a[k] >= def.minimum) : typeof a[k] !== 'string') problems.push(`${k} has the wrong type`);
    else if (def.enum && !def.enum.includes(a[k])) problems.push(`${k} must be one of ${def.enum.join(', ')}`);
  }
  for (const k of Object.keys(a)) if (!(k in schema)) problems.push(`${k} is not allowed`);
  return problems;
}

const classificationOf = (tool, args) => ((tool === 'kb.search' && args.collection === 'audit-evidence') || (tool === 'cloudwatch.query_logs' && args.logGroup === 'security-events') ? 'restricted' : 'internal');

// Pure decision: { outcome: 'allow'|'deny'|'hold', rule, reason, approvers? }
export function decide({ groups, tool, args }) {
  if (!SCHEMAS[tool]) return { outcome: 'deny', rule: 'unknown-tool', reason: 'No such tool' };
  const problems = argProblems(tool, args);
  if (problems.length) return { outcome: 'deny', rule: 'invalid-arguments', reason: problems.join('; ') };
  const never = NEVER(tool);
  if (never) return { outcome: 'deny', ...never };
  if (classificationOf(tool, args) === 'restricted' && !groups.includes('compliance')) return { outcome: 'deny', rule: 'u41-restricted-evidence-compliance-only', reason: 'Restricted evidence is for the compliance group only' };
  if (groups.includes('engineers') && 'repo' in args && !ENGINEER_REPOS.includes(args.repo)) return { outcome: 'deny', rule: 'u40-repo-scope-engineers', reason: "Engineers are scoped to their team's repos" };
  const permit = groups.map((g) => PERMITS[g]?.[tool]).find(Boolean);
  const held = HELD[tool];
  if (held) return permit ? { outcome: 'hold', ...held, approvers: APPROVERS, permit } : { outcome: 'deny', ...held };
  return permit ? { outcome: 'allow', rule: permit, reason: 'Permitted for this group' } : { outcome: 'deny', rule: 'default-deny', reason: 'No policy permits this call' };
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const decode = (auth) => { try { return JSON.parse(Buffer.from(String(auth).replace(/^Bearer /, '').split('.')[1], 'base64url').toString()); } catch { return null; } };
const reply = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body });
const mockResult = (tool, args) => ({ mock: true, tool, ...args, status: 'ok' });

export function createMockFetch({ now = () => new Date() } = {}) {
  const approvals = new Map();
  return async function mockFetch(url, init = {}) {
    const u = new URL(String(url));
    const body = (() => { try { return JSON.parse(init.body || '{}'); } catch { return {}; } })();
    const auth = init.headers?.authorization;

    if (u.pathname === '/mint' && body.agent !== undefined) {
      // Mirrors the stub issuer's agent-subject mint: only the pack's own agent, sub = the agent, no act, invented groups.
      if (body.agent !== AGENT) return reply(400, { error: 'only the pack agent can be minted' });
      const t = Math.floor(now().getTime() / 1000);
      return reply(200, { access_token: `${b64({ alg: 'none', typ: 'at+jwt' })}.${b64({ iss: 'https://mock.invalid', aud: 'mock-pep', sub: AGENT, groups: AGENT_GROUPS, scope: 'tools:invoke', client_id: 'mock-agent-client', iat: t, exp: t + 600, jti: randomUUID() })}.` });
    }
    if (u.pathname === '/mint') {
      const groups = PERSONAS[body.persona];
      if (!groups) return reply(400, { error: `unknown persona (${Object.keys(PERSONAS).join(', ')})` });
      const t = Math.floor(now().getTime() / 1000);
      const claims = { iss: 'https://mock.invalid', aud: 'mock-pep', sub: body.persona, groups, client_id: 'mock-client', iat: t, exp: t + 600, jti: randomUUID(),
        ...(body.scope ? { scope: body.scope } : {}), ...(body.act ? { act: { sub: String(body.act) } } : {}) };
      return reply(200, { access_token: `${b64({ alg: 'none', typ: 'at+jwt' })}.${b64(claims)}.` });
    }

    const claims = decode(auth);
    if (u.pathname === '/mcp') {
      if (!claims) return reply(401, { error: 'invalid_token' });
      const { name: tool, arguments: args = {} } = body.params ?? {};
      const d = decide({ groups: claims.groups ?? [], tool, args });
      const tp = `00-${randomUUID().replace(/-/g, '')}-${randomUUID().replace(/-/g, '').slice(0, 16)}-01`;
      const h = { traceparent: tp };
      if (d.outcome === 'allow') return reply(200, { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify(mockResult(tool, args)) }] } }, h);
      const data = { decision: d.outcome, rule: d.rule, reason: d.reason };
      if (d.outcome === 'hold') {
        const id = randomUUID();
        approvals.set(id, { id, status: 'pending', tool, args, requester: { sub: claims.sub, actor: claims.act?.sub ?? null }, policy: { rule: d.rule, reason: d.reason }, approvers: d.approvers, permit: d.permit, groups: claims.groups });
        Object.assign(data, { approvalId: id, approvers: d.approvers });
      }
      return reply(200, { jsonrpc: '2.0', id: body.id, error: { code: d.outcome === 'hold' ? -32004 : -32003, message: d.outcome === 'hold' ? 'held for approval' : 'denied by policy', data } }, h);
    }

    const m = u.pathname.match(/^\/api\/approvals\/([\w-]+)\/(approve|deny)$/);
    if (m) {
      if (!claims) return reply(401, { error: 'invalid_token' });
      const rec = approvals.get(m[1]);
      if (!rec) return reply(404, { error: 'not_found' });
      // Mirrors the real pack: an approval is visible only to its approvers and its requester (anyone else gets 404);
      // among those, the requester cannot decide their own call (403).
      if (claims.sub !== rec.requester.sub && !rec.approvers.includes(claims.sub)) return reply(404, { error: 'not_found' });
      if (claims.sub === rec.requester.sub) return reply(403, { error: 'not_an_approver' });
      if (rec.status !== 'pending') return reply(409, { error: 'already_decided' });
      rec.status = m[2] === 'approve' ? 'approved' : 'denied';
      rec.decidedBy = claims.sub;
      // On approval the policy point runs the held call itself, once (as the real pack does).
      rec.outcome = m[2] === 'approve' ? { decision: 'allow', rule: rec.permit, reason: 'Permitted after approval', executed: true, result: mockResult(rec.tool, rec.args) }
        : { decision: 'deny', rule: rec.policy.rule, reason: `Denied by ${claims.sub}`, executed: false };
      const { permit, groups, ...view } = rec;
      return reply(200, view);
    }
    return reply(404, { error: 'not_found' });
  };
}
