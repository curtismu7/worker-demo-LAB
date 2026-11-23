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
- "What Privilege did" (Rule 25): the Trace section ends with the shared `GatewayTrace`, vendored byte for byte (`web/src/gateway-trace/`, `server/src/gatewayTrace.js`, pinned by `web/src/gateway-trace/gateway-trace.sha256`; `scripts/gateway-trace.test.mjs` fails a hand-edited copy; never edit them, re-vendor from `AI-DEMO-Standalone/shared/gateway-trace` and re-pin). `server/src/workerTrace.js` is the lab's own builder: `pep.js` (tools/call) and `approvals.js` (approve/deny) attach `trace` to what they return; `runs.js` keeps the approval call on the held step as `approvalCall` (and a refused one as `refused`). Mock: `mockStack.js` attaches `mockDecisions` to its replies, shown as `checked`. Real: only `observed` (rule and reason read from the JSON-RPC refusal) or `inferred`; never `checked`. Change a mock decision in `mockStack.js` and the trace changes with it. The Authorization line never holds a token (Real shows only its length).
- Never commit `.env`. No AI attribution anywhere (owner, 2026-11-07): no Co-Authored-By trailer and no "Generated with" line in commits, PR bodies or files; CI runs `scripts/check-no-ai-attribution.sh`; the gitleaks pre-commit hook runs on every commit.
- Run observability (rule 27): the panel is vendored from AI-DEMO-Standalone `shared/run-observability` (pinned, never edited). The lab side is `server/src/runObs.js`: events are built once from the door's answer, stdout lines go through a safe writer, and the record route is `GET /api/run-observability` in the run's own mode only. This lab reads no logs, so there is no `RUN_OBS_*` setting and no readers file.
