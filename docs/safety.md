# Safety and what is simulated

## Rules this repo keeps

- **Loopback only.** The server binds 127.0.0.1. The container binds 0.0.0.0 inside, and compose publishes on 127.0.0.1 only; a test pins it.
- **Host check and same-origin writes.** A non-loopback Host header gets 403 (DNS rebinding). A cross-origin or cross-site write gets 403.
- **Netguard.** Every socket, DNS lookup, fetch and UDP send to anything except loopback and the hosts listed in `ALLOWED_HOSTS` is refused and recorded. A test asserts a full run makes zero outbound attempts, and startup refuses a `PEP_URL` or `MINT_URL` host that is neither loopback nor listed.
- **Tokens are shown raw (owner decision, rule 4).** The run's tokens are mock-issued by the local stub issuer and labelled as such. The approver's token is never shown. Real credentials do not exist in this repo.
- **No other project's identifiers.** The full history is scanned against a private list that lives outside the repo; gitleaks runs as a pre-commit hook and in CI.

## Hosted mock build (MODE=mock, rule 18)

- **Self-contained.** `MODE=mock` runs an in-process mock issuer and policy table (`server/src/mockStack.js`). It makes no outbound call and ignores `PEP_URL` and `MINT_URL`; a hosted build (`WORKER_HOSTED=1`) refuses to start unless it is mock.
- **Mock tokens.** Unsigned (`alg: none`) and only meaningful to this app. Labelled as such on the page.
- **The decision table is a copy, not the product.** It mirrors the Privilege demo's utility pack (probed 2026-10-21/22). `npm run smoke` runs the same 15 checks against the mock and against the real pack; that is what catches drift (it already caught one: the real pack answers 404, not 403, to someone unrelated to a held call).
- **Per-visitor isolation (rule 13).** Each browser session gets its own workspace through a random `ws` cookie (HttpOnly, SameSite=Strict, Secure when hosted): its own runs, arm switch, kill switch and approvals. The cookie only picks in-memory state and grants nothing. The store is bounded (200 workspaces, 2 hours idle). State is lost on a restart; one replica only.
- **Writes behind the ingress.** The ingress rewrites Host to loopback, so browser writes are accepted from the one configured public host (`ALLOWED_ORIGIN_HOST`, set from `SE_HOST` by the deploy script), never from a trusted header.
- **First SE deploy is owner-approved.** `k8s/deploy.sh` refuses without `OWNER_APPROVED=1`, an immutable image tag and a plain host. Nothing has been deployed.

## What is simulated versus real

| Piece | Status |
| --- | --- |
| GitHub, CloudWatch, knowledge base, backlog, Confluence | Simulated: mocks inside the Privilege demo |
| Policy decisions (allow, deny, hold) | Local Privilege demo evaluating Cedar. Not the Privilege product |
| Access tokens | Stub issuer, not PingFederate |
| Delegated hops: one token per source agent with its own `act` and scope | The hops and per-agent tokens are real calls. The scope is carried but NOT read by the pack's policies (measured 2026-10-21): a narrower scope does not change a decision |
| Over-reach in the delegated lane | A source agent tries `github.merge_pr`: denied by the pack's never-merge rule, whatever scope it holds. Verified against the real pack |
| Unattended token subject | Verified against the Privilege demo's agent-subject mint (privilege-demo PR #3 branch, 2026-10-22): sub = the agent, no `act`, invented groups. The policy cannot tell the call from an attended one (same action), and the audit shows user=delivery-agent, agent=none. How a real PingFederate issues such a token: UNVERIFIED |
| Approvals through `/api/approvals/:id/approve` with a Bearer token | Verified 2026-10-21 against the real pack: Bearer alone is accepted, and the owner of the held call is refused (403). On approval the policy point runs the held call once itself; the agent does not retry |
| Groups, people, repos, log groups | Invented by the Privilege demo's utility pack. Not the customer's |
| RFC 8693 (act claim) | Source listed in the content pack as not-read |
