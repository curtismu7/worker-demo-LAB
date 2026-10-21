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
| Delegated hops: one token per source agent with its own `act` and scope | Modelled. Whether the policies deny the over-reach depends on the utility pack: UNVERIFIED until run against it |
| Unattended token subject | Persona, not the agent: UNVERIFIED limit of the stub issuer |
| Approvals through `/api/approvals/:id/approve` with a Bearer token | UNVERIFIED against the real stack |
| RFC 8693 (act claim) | Source listed in the content pack as not-read |
