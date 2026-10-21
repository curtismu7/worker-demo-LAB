# worker-demo

A standalone SE demo of a worker agent. It runs three ways: attended (a signed-in person asks), delegated (the agent hands work to narrower source agents), and unattended (a schedule, no person present). Every tool call goes through the Privilege demo's policy enforcement point.

**Catalog:** D22 + D23, with a utility skin (NERC CIP style compliance evidence). One of the family of small standalone SE demo repos.
**Status:** v0.1.0, step W0 only. The server answers `GET /api/health`; there are no lanes and no web UI yet. Nothing here is a real GitHub, CloudWatch or Confluence connection; those will be labelled mocks.

## Run

```sh
cp .env.example .env
npm install
npm run doctor   # Node, port, and whether privilege-demo is reachable
npm start        # http://127.0.0.1:6700
npm test
```

Port range for this repo: 6700-6799.
