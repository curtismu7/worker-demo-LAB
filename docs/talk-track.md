# Talk track for SEs

About ten minutes. Start it (`npm start`, then http://127.0.0.1:6700/), turn on **Presenter** if the room is large, and pick a channel. Everything is a mock: say so once, early. The banner at the top says it too, and stays on in presenter mode.

## The one-sentence point

"The agent never gets a free pass: every tool call goes through one policy point that knows who the person is, which agent is acting, and what that agent was delegated. It allows, denies, or holds for a human."

## Flow

1. **Set the scene (30 seconds).** Pick the channel the customer cares about (Teams, GitHub, Cowork, a website, or the HR chatbot site they already have). "The channel is a skin. What stays the same is the identity chain underneath."
2. **Attended, `code-review` (2 minutes).** Run it. Reads and the review comment go through. The merge is refused, and no approval can change that. Open the Tokens panel: `sub` is the person, `act` is the agent. Both land in the audit trail.
3. **Attended with a write, `sprint-planning` (2 minutes).** A draft is allowed; changing a real story waits for a human. Approve it as a different person, then try to approve as the person who asked: it is refused. "Nobody approves their own call." The agent then retries and the run finishes.
4. **Delegated, `compliance-evidence` (3 minutes).** One token per source agent, each with a narrower scope. The last step has the GitHub agent reach for logs: that is the over-reach, and the diagram shows it landing on the policy point. "This is what level of access each agent in the chain is given."
5. **Unattended, `evidence-sweep` (2 minutes).** Show that Run is disabled until you arm it, and that the arm lapses in an hour. Reads run; the requirement update parks. Press the kill switch: it disarms and cancels the parked run, so nothing resumes.
6. **Reset.** The Reset button (or `npm run reset`) clears every run and puts the diagram boxes back where they started.

## Likely questions

- **"Is this the real Privilege product?"** The decisions come from the local Privilege demo, which evaluates Cedar policies. The tokens come from a local stub issuer, not PingFederate. Nothing here talks to GitHub, CloudWatch or Confluence.
- **"Does Ping generate the compliance report?"** No. Ping governs the agent's access to whatever tool produces the report. The reporting tool is a third-party mock here.
- **"Why is the unattended token still tied to a person?"** UNVERIFIED limit of the stub issuer: it cannot mint a token whose subject is the agent yet. In production the unattended chain has the agent as the subject and no actor claim.
- **"Does the approval API accept a Bearer token on its own?"** UNVERIFIED against the real stack. The demo assumes it does.
