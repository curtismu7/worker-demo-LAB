# worker-demo

Standalone SE demo (tier: Demo, catalog D22/D23, utility skin). A worker agent acts for a person; every tool call goes through the Privilege demo's policy enforcement point (`PEP_URL`, default http://127.0.0.1:4510/mcp). Mock only. Rules: `~/Development/STANDALONE-RULES.md`.

- Run: `cp .env.example .env && npm install && npm run doctor && npm start` (http://127.0.0.1:6700). Test: `npm test` (server vitest, web vitest, `node --test scripts/*.test.mjs`). Reset: `npm run reset`. Content pack: `npm run pack`.
- Ports 6700-6849 only. Never 8080, 5173, 3900, 4000, 4400, 4510, 4600-4601, 18080/19080/19090.
- Layout: `server/src` (pep.js = the /mcp client, approvals.js, tokens.js, runs.js = the three lanes + arm + kill, scenarios.js = the scripted runs and talk track, safety.js, netguard.js), `web/src` (App, FlowDiagram = ReactFlow, ChannelFrame, TokenPanel), `scripts`, `docs`.
- The rules that bite:
  - The owner wants tokens shown raw (labelled mock), never client secrets or real credentials.
  - Diagrams are ReactFlow with movable boxes, Simulate, Reset (restores positions) and a speed control. No mermaid.
  - Netguard: no outbound except loopback and `ALLOWED_HOSTS`. Tests use an injected `fetchImpl`, never the network.
  - New CSS uses the theme variables (no purple); text is rendered as text.
  - Never write into another agent's repo. privilege-demo belongs to agents-19; ask via the board.
  - Tool names, scopes and persona names are provisional until privilege-demo's utility pack merges. Tests run against a fake PEP, so rerun against the real one.
- Never commit `.env`. Commits end with the Co-Authored-By trailer; the gitleaks pre-commit hook runs on every commit.
