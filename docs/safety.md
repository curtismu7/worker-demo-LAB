# Safety and what is simulated

## Rules this repo keeps

- **Loopback only.** The server binds 127.0.0.1. The container binds 0.0.0.0 inside, and compose publishes on 127.0.0.1 only; a test pins it.
- **Host check and same-origin writes.** A non-loopback Host header gets 403 (DNS rebinding). A cross-origin or cross-site write gets 403.
- **Netguard.** Every socket, DNS lookup, fetch and UDP send to anything except loopback and the hosts listed in `ALLOWED_HOSTS` is refused and recorded. A test asserts a full run makes zero outbound attempts, and startup refuses a `PEP_URL` or `MINT_URL` host that is neither loopback nor listed.
- **Tokens are shown raw (owner decision, rule 4).** The run's tokens are mock-issued by the local stub issuer and labelled as such. The approver's token is never shown. Real credentials do not exist in this repo.
- **No other project's identifiers.** The full history is scanned against a private list that lives outside the repo; gitleaks runs as a pre-commit hook and in CI.

## What is simulated versus real

| Piece | Status |
| --- | --- |
| GitHub, CloudWatch, knowledge base, backlog, Confluence | Simulated: mocks inside the Privilege demo |
| Policy decisions (allow, deny, hold) | Local Privilege demo evaluating Cedar. Not the Privilege product |
| Access tokens | Stub issuer, not PingFederate |
| Delegated hops: one token per source agent with its own `act` and scope | The hops and per-agent tokens are real calls. The scope is carried but NOT read by the pack's policies (measured 2026-10-21): a narrower scope does not change a decision |
| Over-reach in the delegated lane | A source agent tries `github.merge_pr`: denied by the pack's never-merge rule, whatever scope it holds. Verified against the real pack |
| Unattended token subject | Persona, not the agent: UNVERIFIED limit of the stub issuer |
| Approvals through `/api/approvals/:id/approve` with a Bearer token | Verified 2026-10-21 against the real pack: Bearer alone is accepted, and the owner of the held call is refused (403). On approval the policy point runs the held call once itself; the agent does not retry |
| Groups, people, repos, log groups | Invented by the Privilege demo's utility pack. Not the customer's |
| RFC 8693 (act claim) | Source listed in the content pack as not-read |
