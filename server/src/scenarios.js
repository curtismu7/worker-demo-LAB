// Scripted runs. Each step is one tool call the agent makes; `expect` is what the policy should do, so the page can say
// "as designed" or flag a surprise. Tool names follow the utility pack spec; argument shapes are provisional until that pack merges.
const PR = { repo: 'grid-ops/scada-gateway', pr: 42 };

export const SCENARIOS = {
  'code-review': {
    id: 'code-review', lane: 'attended', title: 'Code and architecture review',
    prompt: 'Review pull request 42 on grid-ops/scada-gateway against our CIP-010 baseline and leave comments. Merge it if it looks fine.',
    talk: ['Read-only is the default: reading and commenting are allowed.', 'The agent tries to merge anyway. Merge authority is not delegated, so it is refused, and approval cannot change that.', 'Point at sub (the person) and act (the agent) in the token: both are in the audit trail.'],
    blurb: 'A signed-in engineer asks the agent to review a pull request. It reads, comments, then tries to merge.',
    steps: [
      { tool: 'github.read_pr', args: PR, expect: 'allow', note: 'Read pull-request context (read-only by default).' },
      { tool: 'kb.search', args: { query: 'NERC CIP-010 configuration baseline' }, expect: 'allow', note: 'Compare against the approved standards.' },
      { tool: 'github.post_review_comment', args: { ...PR, body: 'CIP-010: baseline change lacks a rollback note.' }, expect: 'allow', note: 'A structured review comment.' },
      { tool: 'github.merge_pr', args: PR, expect: 'deny', note: 'The agent has no merge authority; no approval can change that.' },
    ],
  },
  'sprint-planning': {
    id: 'sprint-planning', lane: 'attended', title: 'Sprint planning and story writing',
    prompt: 'Draft a story for quarterly relay credential rotation, then mark STORY-118 ready.',
    talk: ['Drafts are low risk and go straight through.', 'Changing an existing story is a write to a system of record: it waits for a human.', 'Approve it as a different person: nobody approves their own call.'],
    blurb: 'A business analyst asks for a draft story, then for an update to an existing one.',
    steps: [
      { tool: 'backlog.create_story_draft', args: { title: 'Rotate relay credentials quarterly' }, expect: 'allow', note: 'Drafts are allowed.' },
      { tool: 'backlog.update_story', args: { id: 'STORY-118', status: 'ready' }, expect: 'hold', note: 'Updating a real story waits for a human.' },
    ],
  },
};

// Delegated lane: a collector agent hands each source to a narrower source agent. Each hop is its own token (own `act`, narrower
// `scope`). The scopes and the over-reach denial depend on the utility pack's policies and are provisional until it merges.
SCENARIOS['compliance-evidence'] = {
  id: 'compliance-evidence', lane: 'delegated', title: 'Compliance evidence collection',
    prompt: 'Collect CIP-010 evidence for the last quarter from GitHub, the logs and the knowledge base.',
  talk: ['One token per source agent, each narrower than the one above it.', 'Each source agent can reach only its own source. The last step is the over-reach.', 'The sheet says this is where agents start talking to agents: this is what level of access each one is given.'],
  blurb: 'A compliance officer asks for CIP-010 evidence. The collector delegates to one agent per source, each with narrower access. One agent then reaches outside its remit.',
  steps: [
    { agent: 'github-source-agent', scope: 'github:read', tool: 'github.read_pr', args: PR, expect: 'allow', note: 'Pull-request evidence, read-only.' },
    { agent: 'logs-source-agent', scope: 'logs:read', tool: 'cloudwatch.query_logs', args: { query: 'config changes last 90 days' }, expect: 'allow', note: 'Log evidence, read-only.' },
    { agent: 'kb-source-agent', scope: 'kb:read', tool: 'kb.search', args: { query: 'CIP-010 evidence requirements' }, expect: 'allow', note: 'Standards to map the evidence to.' },
    { agent: 'github-source-agent', scope: 'github:read', tool: 'cloudwatch.query_logs', args: { query: 'all production logs' }, expect: 'deny', note: 'The GitHub agent reaches for logs. Not its remit.' },
  ],
};

// Unattended lane: starts with no person in the session, only when armed (see runs.js). A write above its remit parks the run.
SCENARIOS['evidence-sweep'] = {
  id: 'evidence-sweep', lane: 'unattended', title: 'Quarterly evidence sweep (unattended)',
    prompt: 'Scheduled job: run the quarterly CIP-010 evidence sweep.',
  talk: ['Nobody is signed in. It only runs while armed, and the arm expires in an hour.', 'Reads run. Changing a requirement is never unattended: the run parks.', 'Kill switch: disarms and cancels anything still waiting, so nothing resumes later.'],
  blurb: 'A schedule fires the sweep with nobody signed in. Reads run; the requirement update waits for a human.',
  steps: [
    { agent: 'sweep-agent', tool: 'kb.search', args: { query: 'CIP-010 evidence requirements' }, expect: 'allow', note: 'Read the standard.' },
    { agent: 'sweep-agent', tool: 'github.read_pr', args: PR, expect: 'allow', note: 'Read the change evidence.' },
    { agent: 'sweep-agent', tool: 'confluence.update_requirement', args: { id: 'REQ-210', status: 'evidence-attached' }, expect: 'hold', note: 'Changing a requirement is never unattended.' },
  ],
};

export const listScenarios = () => Object.values(SCENARIOS).map(({ id, lane, title, blurb, prompt, talk, steps }) => ({ id, lane, title, blurb, prompt, talk, stepCount: steps.length }));
