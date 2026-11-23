// Rule 27: the shared run-observability panel for this lab, with the lab's own note around it.
// It asks the lab for one run's record by the run's id, in the mode the run was made in. The key includes the run's status and step count, so a
// new answer (an approval, the end of a run) asks again, and a record for an older state is never shown. Nothing is re-read on a timer.
import { useEffect, useState } from "react";
import RunObservability from "./run-observability/RunObservability.jsx";

// Where this lab's run leaves logs and where they can stream (the README says the same).
export const LOG_STREAMS = [
  { product: "Worker Agent Demo (this container)", lives: "its stdout: one line per decision the lab records (the Privilege demo's allow, deny or hold for each call, each approval answer, the start of a run). Each line has its time, the step, the person it is for, a result and a run id, never a token, a credential or a gateway address. The same in Mock and Real", streams: "nowhere today: the family log collector does not name this container, so a line reaches no SIEM. A line's time is when the lab had the Privilege demo's answer" },
  { product: "Privilege demo (the policy point)", lives: "its own logs and approvals record, which this lab does not read", streams: "outside this lab" },
];

const TITLE = "What each layer logged for this run";
const Note = ({ testId, role, children }) => (
  <div className="obs">
    <section className="ro" data-testid={testId} aria-label={TITLE}>
      <h2>{TITLE}</h2>
      <p className="ro-muted" role={role}>{children}</p>
    </section>
  </div>
);

// The lab's own note: true for every action the page can take. Arming, kill and Reset add no rows; a request to the door is a protocol request.
const NOTE = {
  mock: "Mock: these rows are the decisions the in-process copy of the Privilege demo's policy computed for this run, not read from any product log. Person is the name chosen in the header (Mock has no sign-in). Agent is the agent's own call: an act, not a decision. Privilege is the policy decision for each call; an approval answer is information. Authorize and the agent gateway are not shown: this lab does not call PingOne Authorize, and the door is the policy point. Arming, kill and Reset are not decisions and add no rows.",
  real: "Real: each row is a reply this lab received from the Privilege demo's door, the policy point, not a log line. Person is the PingFederate sign-in the run used; the sign-in is not read here. An approval answer is information, not a policy decision. Requests to the door are protocol requests, not configuration changes: each one is shown here only when it got an answer. Arming, kill and Reset add no rows.",
};

const isRecord = (r) => Boolean(r) && typeof r === "object" && !Array.isArray(r) && Array.isArray(r.rows);

export default function RunObs({ source, runId, stamp }) {
  const key = `${source}|${runId}|${stamp}`;
  const [answer, setAnswer] = useState(null); // { key, record, error }: the answer to the request for `key`
  useEffect(() => {
    let live = true;
    const done = (a) => { if (live) setAnswer({ key, ...a }); };
    fetch(`/api/run-observability?runId=${encodeURIComponent(runId)}`, { headers: { accept: "application/json" } }).then(
      async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) return done({ record: null, error: body?.message || `The lab answered ${r.status}.` });
        if (body && typeof body === "object" && !Array.isArray(body) && isRecord(body.record)) return done({ record: body.record });
        return done({ record: null, error: "The lab's answer was not a run record." });
      },
      (e) => done({ record: null, error: `Could not reach the lab (${String(e?.message || e).slice(0, 120)}).` }),
    );
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- the key names every input of the request

  if (!answer || answer.key !== key) return <Note testId="ro-loading">Collecting this run's logs…</Note>; // never the previous record
  if (answer.error) return <Note testId="ro-error" role="alert">{answer.error}</Note>;
  return (
    <div className="obs">
      <RunObservability record={answer.record} source={source} streams={LOG_STREAMS} />
      <p className="ro-muted" data-testid="ro-lab-note">{NOTE[source === "mock" ? "mock" : "real"]}</p>
    </div>
  );
}
