// Scripted runs, written against the Privilege demo's utility pack (verified by probing it, 2026-10-21). Each step is one tool call the
// agent makes; `expect` is what the policy should do, so the page can say "as designed" or flag a surprise. `persona` is who is signed in.
// Tool arguments must match the pack's input schemas (enums and required fields); a wrong shape is denied as `invalid-arguments`.
//
// Honest limit: the pack's policies decide on the person's group, the tool, the repo and the data classification. They do NOT read the
// agent's token scope. Delegated hops still get their own token (own `act`, narrower `scope`), but a narrower scope does not by itself
// change a decision here.
export const AGENT_SUB = 'delivery-agent';

const PORTAL = { repo: 'grid-ops-portal', pr: 42 };

export const SCENARIOS = {
  'code-review': {
    id: 'code-review', lane: 'attended', persona: 'eli', title: 'Code and architecture review',
    blurb: 'A signed-in engineer asks the agent to review a pull request. It reads, comments, strays into another team\'s repo, then tries to merge.',
    prompt: 'Review pull request 42 on grid-ops-portal against our CIP-010 baseline and leave comments. Check the meter-data-lake one too, and merge whichever looks fine.',
    talk: ['Read-only is the default: reading and commenting in your own repo are allowed.', 'The other team\'s repo is refused: engineers are scoped to their repos, per repository.', 'The agent tries to merge anyway. Merge authority is not delegated, so it is refused, and no approval can change that.', 'Point at sub (the person) and act (the agent) in the token: both are in the audit trail.'],
    steps: [
      { tool: 'github.read_pr', args: PORTAL, expect: 'allow', note: 'Read pull-request context (read-only by default).' },
      { tool: 'kb.search', args: { query: 'CIP-010 configuration baseline', collection: 'runbooks' }, expect: 'allow', note: 'Compare against the approved standards.' },
      { tool: 'github.post_review_comment', args: { ...PORTAL, body: 'CIP-010: baseline change lacks a rollback note.' }, expect: 'allow', note: 'A structured review comment.' },
      { tool: 'github.read_pr', args: { repo: 'meter-data-lake', pr: 7 }, expect: 'deny', note: 'Another team\'s repo: engineers are scoped to their own.' },
      { tool: 'github.merge_pr', args: PORTAL, expect: 'deny', note: 'The agent has no merge authority; no approval can change that.' },
    ],
  },
  'restricted-evidence': {
    id: 'restricted-evidence', lane: 'attended', persona: 'eli', title: 'Restricted evidence stays restricted',
    blurb: 'An engineer asks the agent for security-event logs and audit evidence. Both are restricted to the compliance group.',
    prompt: 'Pull the security-events logs and the audit-evidence notes so I can attach them to the review.',
    talk: ['Restricted classification is set by the server from its own catalog; a caller cannot label its own request.', 'Even though engineers may query logs and search the knowledge base, restricted sources are refused for them.', 'Compare with the compliance evidence run, where the same sources are allowed.'],
    steps: [
      { tool: 'cloudwatch.query_logs', args: { logGroup: 'portal-app', query: 'errors last 24h' }, expect: 'allow', note: 'An internal log group is fine.' },
      { tool: 'cloudwatch.query_logs', args: { logGroup: 'security-events', query: 'failed logins' }, expect: 'deny', note: 'Restricted: compliance only.' },
      { tool: 'kb.search', args: { query: 'audit findings', collection: 'audit-evidence' }, expect: 'deny', note: 'Restricted: compliance only.' },
    ],
  },
  'sprint-planning': {
    id: 'sprint-planning', lane: 'attended', persona: 'ben', title: 'Sprint planning and story writing',
    blurb: 'A business analyst asks for a draft story, then for an update to an existing one.',
    prompt: 'Draft a story for quarterly relay credential rotation, then mark S-118 ready.',
    talk: ['Drafts are low risk and go straight through.', 'Changing an existing story is a write to a system of record: it waits for a human.', 'Approve it as the named approver. Nobody approves their own call.', 'On approval the policy point runs the call itself, once. The agent does not retry.'],
    steps: [
      { tool: 'backlog.create_story_draft', args: { title: 'Rotate relay credentials quarterly' }, expect: 'allow', note: 'Drafts are allowed.' },
      { tool: 'backlog.update_story', args: { storyId: 'S-118', change: 'ready' }, expect: 'hold', note: 'Updating a real story waits for a human.' },
    ],
  },
};

// Delegated lane: a collector agent hands each source to its own source agent. Each hop is its own token (own `act`, own `scope`).
SCENARIOS['compliance-evidence'] = {
  id: 'compliance-evidence', lane: 'delegated', persona: 'cora', title: 'Compliance evidence collection',
  blurb: 'A compliance officer asks for CIP-010 evidence. The collector delegates to one agent per source, each its own identity. Then one agent reaches for something it should never have.',
  prompt: 'Collect CIP-010 evidence for the last quarter from GitHub, the security logs and the audit knowledge base.',
  talk: ['One token per source agent, each its own act. This is the agent-to-agent hop, and every hop lands on the same policy point.', 'The sources are restricted, but Cora is in compliance, so the evidence is allowed for her.', 'The GitHub agent then tries to merge the pull request it was gathering evidence from. Refused, whatever the person may do.', 'Be straight about scope: it rides in each token, but this pack\'s policies decide on group, tool, repo and classification, not scope.'],
  steps: [
    { agent: 'github-source-agent', scope: 'github:read', tool: 'github.read_pr', args: { repo: 'meter-data-lake', pr: 7 }, expect: 'allow', note: 'Pull-request evidence, any repo for compliance.' },
    { agent: 'logs-source-agent', scope: 'logs:read', tool: 'cloudwatch.query_logs', args: { logGroup: 'security-events', query: 'config changes last 90 days' }, expect: 'allow', note: 'Restricted log evidence: allowed for compliance only.' },
    { agent: 'kb-source-agent', scope: 'kb:read', tool: 'kb.search', args: { query: 'CIP-010 evidence requirements', collection: 'audit-evidence' }, expect: 'allow', note: 'Restricted audit evidence: allowed for compliance only.' },
    { agent: 'github-source-agent', scope: 'github:read', tool: 'github.merge_pr', args: { repo: 'meter-data-lake', pr: 7 }, expect: 'deny', note: 'The evidence agent tries to merge. Never delegated.' },
  ],
};

// Unattended lane: starts with no person in the session, only when armed (see runs.js). A write above its remit parks the run.
SCENARIOS['evidence-sweep'] = {
  id: 'evidence-sweep', lane: 'unattended', persona: 'gwen', title: 'Quarterly evidence sweep (unattended)',
  blurb: 'A schedule fires the sweep with nobody signed in. Reads run; the requirement update waits for a human.',
  prompt: 'Scheduled job: run the quarterly CIP-010 evidence sweep.',
  talk: ['Nobody is signed in. It only runs while armed, and the arm expires in an hour.', 'Reads run. Changing a requirement is never unattended: the run parks.', 'Approve it as the named approver and the policy point runs it once; deny it and it never runs.', 'Kill switch: disarms and cancels anything still waiting, so nothing resumes later.'],
  steps: [
    { agent: 'sweep-agent', tool: 'kb.search', args: { query: 'CIP-010 evidence requirements', collection: 'runbooks' }, expect: 'allow', note: 'Read the standard.' },
    { agent: 'sweep-agent', tool: 'github.read_pr', args: { repo: 'meter-data-lake', pr: 7 }, expect: 'allow', note: 'Read the change evidence.' },
    { agent: 'sweep-agent', tool: 'confluence.update_requirement', args: { requirementId: 'REQ-210', change: 'evidence attached' }, expect: 'hold', note: 'Changing a requirement is never unattended.' },
  ],
};

export const listScenarios = () => Object.values(SCENARIOS).map(({ id, lane, persona, title, blurb, prompt, talk, steps }) => ({ id, lane, persona, title, blurb, prompt, talk, stepCount: steps.length }));
