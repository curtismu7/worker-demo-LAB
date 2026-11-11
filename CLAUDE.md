# worker-demo

Standalone SE demo (tier: Demo, catalog D22/D23, utility skin). A worker agent acts for a person; every tool call goes through the Privilege demo's policy enforcement point (`PEP_URL`, default http://127.0.0.1:4510/mcp). Mock only. Rules: `~/Development/STANDALONE-RULES.md`.

- Run: `cp .env.example .env && npm install && npm run doctor && npm start` (http://127.0.0.1:6700). Test: `npm test` (server vitest, web vitest, `node --test scripts/*.test.mjs`). Reset: `npm run reset`. Content pack: `npm run pack`.
- Ports 6700-6849 only. Never 8080, 5173, 3900, 4000, 4400, 4510, 4600-4601, 18080/19080/19090.
- Layout: `server/src` (pep.js = the /mcp client, approvals.js, tokens.js, runs.js = the three lanes + arm + kill, scenarios.js = the scripted runs and talk track, safety.js, netguard.js), `web/src` (App, FlowDiagram = ReactFlow, ChannelFrame, TokenPanel), `scripts`, `docs`.
- `MODE=local` (default for npm start; compose sets it) calls the real Privilege demo. `MODE=mock` (the Docker image default, and the SE k8s build with `WORKER_HOSTED=1`) is fully in-process: `server/src/mockStack.js`. Every browser session is its own workspace (`ws` cookie, `server/src/workspaces.js`).
- The rules that bite:
  - The owner wants tokens shown raw (labelled mock), never client secrets or real credentials.
  - Diagrams are ReactFlow with movable boxes, Simulate, Reset (restores positions) and a speed control. No mermaid.
  - Netguard: no outbound except loopback and `ALLOWED_HOSTS`. Tests use an injected `fetchImpl`, never the network.
  - New CSS uses the theme variables (no purple); text is rendered as text.
  - Never write into another agent's repo. privilege-demo belongs to agents-19; ask via the board.
  - The unit tests use a fake PEP. The truth is `npm run smoke` against the real privilege-demo utility pack (see README); rerun it after any scenario change. Tool arguments must match the pack's schemas (enums), or the call is denied `invalid-arguments`.
  - mockStack.js is a COPY of the utility pack's decisions. Change one, change the other, and run `npm run smoke` against both modes.
  - The unattended lane mints an agent-subject token (`{agent}`): sub = the agent, no act.
  - The pack's policies ignore token scope. Never claim scope enforcement. A held call is run once by the policy point on approval: the agent must not retry it.
- Never commit `.env`. No AI attribution anywhere (owner, 2026-11-07): no Co-Authored-By trailer and no "Generated with" line in commits, PR bodies or files; CI runs `scripts/check-no-ai-attribution.sh`; the gitleaks pre-commit hook runs on every commit.
