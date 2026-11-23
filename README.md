# Worker Demo LAB

Repo: https://github.com/curtismu7/worker-demo-LAB

Tier: Demo

A standalone SE demo of a worker agent. It runs three ways: attended (a signed-in person asks), delegated (the agent hands work to narrower source agents), and unattended (a schedule, no person present). Every tool call goes through the Privilege demo's policy enforcement point.

**Catalog:** D22 + D23, with a utility skin (NERC CIP style compliance evidence). One of the family of small standalone SE demo repos.
**Tier:** Demo. **Status:** v0.3.0. Three lanes (attended, delegated, unattended with the agent as the token subject), five scenarios, approvals, kill switch, five channel skins, presenter mode with a talk track, `customer.config.json`, per-visitor workspaces, Docker, CI, content pack, and a mock-only SE k8s build (manifests and deploy script; never deployed). Two modes from one image: `MODE=local` (the real Privilege demo and its stub issuer) and `MODE=mock` (everything in-process; the hosted build). `npm run smoke` passes the same 15 checks against both. Not verified: PingFederate tokens (a stub issuer is used), the customer's real groups, and how a real PingFederate issues an agent-subject token. Nothing here is a real GitHub, CloudWatch or Confluence connection. See `docs/safety.md` for what is simulated and `docs/talk-track.md` to present it.

## Run from a clone

Prerequisites: Node 26. Docker (OrbStack) only for the Docker form.

```
git clone https://github.com/curtismu7/worker-demo-LAB.git
cd worker-demo-LAB
npm ci
npm run build
npm run doctor
npm start
```

## Ports, and what to do if the port is taken

```
Ports: worker-demo-LAB listens on 6700 (set with PORT, default 6700).
Port range for this app: 6700-6849.

If the port is taken:
1. Find what is using it:
   lsof -iTCP:6700 -sTCP:LISTEN -n -P
2. If it is an old copy of this app, stop that process: kill <PID>.
3. If it is something else, stop it, or start this app on another port:
   PORT=<other port> npm start
```

Other variable: `HOST_PORT=6700` (Docker host port). Keep both inside 6700-6849.

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

## What Privilege did

Under each run, the Trace section has a **What Privilege did** panel: for every call the agent makes to the Privilege demo's door (and for the approver's decision on a held call), the exact request, the exact response and the decisions in between. In Mock the in-process door computed them (marked checked; it reports the check that decided, the token and then the policy, not every rule inside its table). In Real the Privilege demo answers with a status and a body, so the decisions are read from the reply (observed) or from the outcome (inferred). Tokens are shortened or reduced to their length in the trace.

## No other service needed: MODE=mock

`MODE=mock npm start` runs the whole demo in one process (built-in mock issuer and policy table). Each browser session is its own workspace. This is also what the SE k8s build runs (`k8s/`, `k8s/deploy.sh`; the first deploy is owner-approved).

## Run against the Privilege demo (utility pack)

In a clone of the `privilege-demo` repo (main has the pack): `PACK=utility node stub-issuer/server.mjs` (the local stub issuer, port 9031; the unattended lane needs the agent-subject mint from privilege-demo PR #3, or main once it merges), then run the app with `PACK=utility IDP=pf PF_URL=http://127.0.0.1:9031 PF_AUDIENCE=privilege-demo` on port 4510 (see that repo's README). Then start this demo (`MODE=local`, the default for `npm start`) and run `npm run smoke`. Run it against `MODE=mock` too.

## What each layer logged for this run (rule 27)

The page shows, under the trace of each run, one run's six layers (person, agent, Authorize, Privilege, agent gateway, resource server) in time order. Every row has its time and a tag: `simulated` (Mock: the in-process copy of the Privilege demo's policy computed it), `response` (Real: a reply this lab received from the Privilege demo's door, not a log line) or `not-logged`.

- **Where the logs live:** this lab's own stdout holds one line per decision it records (each call's allow, deny or hold, each approval answer, the start of a run). No token, credential or gateway address is written. The Privilege demo's logs are not read here.
- **Where they stream:** nowhere today. The family log collector does not name this container.
- **Not logged today:** PingOne Authorize (this lab does not call it), the agent gateway (the door is the policy point, shown under Privilege) and the resource server (the tool writes no log this lab reads). An allow is the door's decision, not confirmation that the tool ran.
- **Partial records:** a call that got no reply has no row; the record says so. An approval answer that got no reply is a no-reply exchange on the trace, never a refusal.
- **Time:** each row is the moment the lab had the door's answer.
- **Shared panel:** `web/src/run-observability/` and `server/src/runObservability.js` are vendored from AI-DEMO-Standalone `shared/run-observability` and pinned (`scripts/run-observability-checkPin.mjs`). This lab reads no logs, so it vendors no readers file.
- **Inherited text (not edited here):** `web/src/run-observability/run-observability.sha256` omits the header comment block of the canonical manifest. The five file hashes match the canonical, so the pin is correct. The fix belongs upstream in AI-DEMO-Standalone `shared/run-observability`.
- **Not verified (run observability, inherited, not fixed here):**
  - A no-reply approval shows the trace step as "priya tries to approve: no reply from the Privilege demo | refused at: Reach the gateway" with a FAIL badge. The FAIL and the "refused at" summary come from the vendored `GatewayTrace.jsx` and the vendored `failureTrace` in `server/src/gatewayTrace.js`, so they are an inherited follow-up for AI-DEMO-Standalone `shared/gateway-trace`. The run panel itself says "no reply" and is correct.
  - Report-only, not changed: the vendored run-observability manifest (see the inherited text above) and the listener on port 6781, which is an ssh tunnel.
  - Follow-up, pre-existing on main, not in the panel: the Theme select in `web/src/App.jsx` maps a string array as pairs, so its options show single characters and the stored value is not `light`/`dark`. Use the OS colour scheme until it is fixed.
