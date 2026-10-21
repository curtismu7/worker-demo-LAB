# worker-demo

A standalone SE demo of a worker agent. It runs three ways: attended (a signed-in person asks), delegated (the agent hands work to narrower source agents), and unattended (a schedule, no person present). Every tool call goes through the Privilege demo's policy enforcement point.

**Catalog:** D22 + D23, with a utility skin (NERC CIP style compliance evidence). One of the family of small standalone SE demo repos.
**Status:** v0.1.0, W1 server core. `POST /api/runs` runs a scripted attended scenario (code-review, sprint-planning) through the Privilege demo. No web UI yet. Tests use a fake Privilege demo; the real stack has not been exercised, and the utility tool names are provisional until privilege-demo's pack merges. Nothing here is a real GitHub, CloudWatch or Confluence connection.

## Run

```sh
cp .env.example .env
npm install
npm run doctor   # Node, port, and whether privilege-demo is reachable
npm start        # http://127.0.0.1:6700
npm test
```

Port range for this repo: 6700-6799.
