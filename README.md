# worker-demo

A standalone SE demo of a worker agent. It runs three ways: attended (a signed-in person asks), delegated (the agent hands work to narrower source agents), and unattended (a schedule, no person present). Every tool call goes through the Privilege demo's policy enforcement point.

**Catalog:** D22 + D23, with a utility skin (NERC CIP style compliance evidence). One of the family of small standalone SE demo repos.
**Tier:** Demo. **Status:** v0.2.0. Three lanes (attended, delegated, unattended), approvals through the Privilege demo, kill switch, five channel skins, presenter mode with a talk track, `customer.config.json` (see `customer.config.example.json`), Docker, CI, content pack. Tests run against a fake Privilege demo; the real stack has not been exercised, and the utility tool names, scopes and persona names are provisional until privilege-demo's pack merges. Nothing here is a real GitHub, CloudWatch or Confluence connection. See `docs/safety.md` for what is simulated and `docs/talk-track.md` to present it.

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

Port range for this repo: 6700-6799.
