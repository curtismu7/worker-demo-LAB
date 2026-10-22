# worker-demo

A standalone SE demo of a worker agent. It runs three ways: attended (a signed-in person asks), delegated (the agent hands work to narrower source agents), and unattended (a schedule, no person present). Every tool call goes through the Privilege demo's policy enforcement point.

**Catalog:** D22 + D23, with a utility skin (NERC CIP style compliance evidence). One of the family of small standalone SE demo repos.
**Tier:** Demo. **Status:** v0.3.0. Three lanes (attended, delegated, unattended with the agent as the token subject), five scenarios, approvals, kill switch, five channel skins, presenter mode with a talk track, `customer.config.json`, per-visitor workspaces, Docker, CI, content pack, and a mock-only SE k8s build (manifests and deploy script; never deployed). Two modes from one image: `MODE=local` (the real Privilege demo and its stub issuer) and `MODE=mock` (everything in-process; the hosted build). `npm run smoke` passes the same 15 checks against both. Not verified: PingFederate tokens (a stub issuer is used), the customer's real groups, and how a real PingFederate issues an agent-subject token. Nothing here is a real GitHub, CloudWatch or Confluence connection. See `docs/safety.md` for what is simulated and `docs/talk-track.md` to present it.

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

## No other service needed: MODE=mock

`MODE=mock npm start` runs the whole demo in one process (built-in mock issuer and policy table). Each browser session is its own workspace. This is also what the SE k8s build runs (`k8s/`, `k8s/deploy.sh`; the first deploy is owner-approved).

## Run against the Privilege demo (utility pack)

In a clone of `cmuir_pingcorp/privilege-demo` (main has the pack): `PACK=utility node stub-issuer/server.mjs` (the local stub issuer, port 9031; the unattended lane needs the agent-subject mint from privilege-demo PR #3, or main once it merges), then run the app with `PACK=utility IDP=pf PF_URL=http://127.0.0.1:9031 PF_AUDIENCE=privilege-demo` on port 4510 (see that repo's README). Then start this demo (`MODE=local`, the default for `npm start`) and run `npm run smoke`. Run it against `MODE=mock` too.
