# worker-demo

A standalone SE demo of a worker agent. It runs three ways: attended (a signed-in person asks), delegated (the agent hands work to narrower source agents), and unattended (a schedule, no person present). Every tool call goes through the Privilege demo's policy enforcement point.

**Catalog:** D22 + D23, with a utility skin (NERC CIP style compliance evidence). One of the family of small standalone SE demo repos.
**Status:** v0.1.0, W2. Three lanes: attended (code-review, sprint-planning), delegated (compliance-evidence: one token per source agent, narrower scope each) and unattended (evidence-sweep, behind a one-hour arm switch). Tests use a fake Privilege demo; the real stack has not been exercised, and the utility tool names, scopes and persona names are provisional until privilege-demo's pack merges. The unattended lane still carries a persona as `sub`: the stub issuer cannot mint an agent-subject token yet. Nothing here is a real GitHub, CloudWatch or Confluence connection.

## Run

```sh
cp .env.example .env
npm install
npm run doctor   # Node, port, and whether privilege-demo is reachable
npm start        # http://127.0.0.1:6700
npm test
```

Port range for this repo: 6700-6799.
