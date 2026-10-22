# Talk track for SEs

About ten minutes. Start it (`npm start`, then http://127.0.0.1:6700/), turn on **Presenter** if the room is large, and pick a channel. Everything is a mock: say so once, early. The banner at the top says it too, and stays on in presenter mode.

## The one-sentence point

"The agent never gets a free pass: every tool call goes through one policy point that knows who the person is, which agent is acting, and what that agent was delegated. It allows, denies, or holds for a human."

## Flow

1. **Set the scene (30 seconds).** Pick the channel the customer cares about (Teams, GitHub, Cowork, a website, or the HR chatbot site they already have). "The channel is a skin. What stays the same is the identity chain underneath." Each scenario signs in as its own person.
2. **Attended, `code-review` (2 minutes).** As Eli, an engineer. Reads and the review comment in his own repo go through. The other team's repo is refused (engineers are scoped per repository), and so is the merge, which no approval can change. Open the Tokens panel: `sub` is the person, `act` is the agent. Both land in the audit trail.
3. **Restricted evidence, `restricted-evidence` (1 minute).** Same engineer asks for security logs and audit evidence: refused. "The classification is set by the server, not by the caller."
4. **Attended with a write, `sprint-planning` (2 minutes).** As Ben, an analyst. A draft is allowed; changing a real story waits for a human. Try approving as Ben: refused ("nobody approves their own call"). Approve as Priya: the policy point runs the call once, itself. The agent does not retry.
5. **Delegated, `compliance-evidence` (2 minutes).** As Cora, in compliance. One token per source agent, each its own identity. The restricted sources are allowed for her. Then the GitHub agent tries to merge the pull request it was gathering evidence from: refused whatever the person may do.
6. **Unattended, `evidence-sweep` (2 minutes).** Nobody is signed in (the person picker is off) and there is no `act` claim: open the Tokens panel, `sub` is the agent itself. Show that Run is disabled until you arm it, and that the arm lapses in an hour. Reads run; the requirement update parks. Approve as Priya and it runs once, or press the kill switch: it disarms and cancels the parked run, so nothing resumes.
7. **Reset.** The Reset button (or `npm run reset`) clears every run and puts the diagram boxes back where they started.

## Likely questions

- **"Is this the real Privilege product?"** The decisions come from the local Privilege demo, which evaluates Cedar policies. The tokens come from a local stub issuer, not PingFederate. Nothing here talks to GitHub, CloudWatch or Confluence.
- **"Does Ping generate the compliance report?"** No. Ping governs the agent's access to whatever tool produces the report. The reporting tool is a third-party mock here.
- **"Does a narrower token scope stop the agent?"** Not in this pack. Each hop carries its own scope, but the policies decide on the person's group, the tool, the repo and the data classification. Measured: a compliance token limited to `github:read` still read restricted logs. Say so; do not claim scope enforcement.
- **"Can the policy tell an unattended call from an attended one?"** Not in this pack: the decision action is the same, so policy text cannot distinguish them, and the audit shows user=delivery-agent, agent=none. Do not claim otherwise. How a real PingFederate issues an agent-subject token is UNVERIFIED.
- **"Is the hosted copy the real thing?"** No. On the SE site the decisions come from a mock table inside the app that mirrors the Privilege demo; the same smoke checks pass against both. Your runs there are private to your browser session.
- **"Do the groups match ours?"** No. The groups and people are invented, and the real ones would come from the customer's PingFederate (UNVERIFIED whether it puts `groups` and an object-valued `act` in access tokens).
