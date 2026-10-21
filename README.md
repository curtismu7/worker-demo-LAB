# worker-demo

A standalone SE demo of a worker agent. It runs three ways: attended (a signed-in person asks), delegated (the agent hands work to narrower source agents), and unattended (a schedule, no person present). Every tool call goes through the Privilege demo's policy enforcement point.

**Catalog:** D22 + D23, with a utility skin (NERC CIP style compliance evidence). One of the family of small standalone SE demo repos.
**Tier:** Demo. **Status:** v0.2.0. Three lanes (attended, delegated, unattended), five scenarios, approvals through the Privilege demo, kill switch, five channel skins, presenter mode with a talk track, `customer.config.json` (see `customer.config.example.json`), Docker, CI, content pack. `npm run smoke` drives every scenario against the real Privilege demo utility pack (14 checks passed on 2026-10-21; CI never runs it, because it needs that stack). Not verified: PingFederate tokens (a stub issuer is used), the customer's real groups, and agent-subject tokens for the unattended lane. Nothing here is a real GitHub, CloudWatch or Confluence connection. See `docs/safety.md` for what is simulated and `docs/talk-track.md` to present it.

## Run

```sh
cp .env.example .env
npm install
npm run doctor   # Node, port, and whether privilege-demo is reachable
npm start        # http://127.0.0.1:6700
npm test
npm run reset    # forget every run and disarm
```

Docker (OrbStack): `HOST_PORT=6700 docker compose up --build -d`. The container reaches the Privilege demo on the host by name; only that name is allowed out.

Port range for this repo: 6700-6849.

## Run against the Privilege demo (utility pack)

In a clone of `cmuir_pingcorp/privilege-demo` (main has the pack): `PACK=utility node stub-issuer/server.mjs` (the local stub issuer, port 9031), then run the app with `PACK=utility IDP=pf PF_URL=http://127.0.0.1:9031 PF_AUDIENCE=privilege-demo` on port 4510 (see that repo's README). Then start this demo and run `npm run smoke`.
