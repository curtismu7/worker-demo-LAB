import { useEffect, useRef, useState } from "react";
import FlowDiagram from "./FlowDiagram.jsx";
import { getPersonas, getScenarios, startRun } from "./api.js";

const SPEEDS = [0.5, 1, 2, 4];
const OUTCOME_TEXT = { allow: "Allowed", deny: "Denied", hold: "Held for approval", error: "Error" };

export default function App() {
  const [scenarios, setScenarios] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [scenarioId, setScenarioId] = useState("");
  const [persona, setPersona] = useState("");
  const [run, setRun] = useState(null);
  const [shown, setShown] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    Promise.all([getScenarios(), getPersonas()]).then(([s, p]) => {
      setScenarios(s.scenarios); setPersonas(p.personas);
      setScenarioId(s.scenarios[0]?.id ?? ""); setPersona(p.personas[0] ?? "");
    }).catch((e) => setError(e.message));
    return () => clearTimeout(timer.current);
  }, []);

  const steps = run?.steps ?? [];
  const play = (total, from = 0) => {
    clearTimeout(timer.current);
    setShown(from);
    const tick = (n) => { if (n >= total) return; timer.current = setTimeout(() => { setShown(n + 1); tick(n + 1); }, 900 / speed); };
    tick(from);
  };

  async function onRun() {
    setBusy(true); setError(""); clearTimeout(timer.current); setShown(0);
    try { const r = await startRun(scenarioId, persona); setRun(r); play(r.steps.length); } catch (e) { setError(e.message); setRun(null); } finally { setBusy(false); }
  }
  const onSimulate = () => run && play(run.steps.length);
  const onReset = () => { clearTimeout(timer.current); setRun(null); setShown(0); setError(""); setResetKey((k) => k + 1); };
  const sc = scenarios.find((s) => s.id === scenarioId);

  return (
    <main className="page">
      <header>
        <h1>Worker agent demo</h1>
        <p className="lede">An agent acts for a signed-in person. Every tool call it makes goes through the Privilege policy enforcement point, which allows it, denies it, or holds it for a human. <strong>Mock mode:</strong> GitHub, the knowledge base and the backlog are simulated.</p>
      </header>

      <section className="controls" aria-label="Run controls">
        <label>Scenario
          <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>{scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
        </label>
        <label>Signed in as
          <select value={persona} onChange={(e) => setPersona(e.target.value)}>{personas.map((p) => <option key={p}>{p}</option>)}</select>
        </label>
        <label>Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}</select>
        </label>
        <button className="primary" onClick={onRun} disabled={busy || !scenarioId || !persona}>{busy ? "Running…" : "Run"}</button>
        <button onClick={onSimulate} disabled={!run}>Simulate again</button>
        <button onClick={onReset}>Reset</button>
      </section>
      {sc && <p className="blurb">{sc.blurb}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <FlowDiagram run={run} steps={steps} shown={shown} resetKey={resetKey} />

      {run && (
        <section aria-label="Run trace">
          <h2>Trace <span className={`status status-${run.status}`}>{run.status}</span></h2>
          <p className="claims">Token: <code>sub={run.claims?.sub}</code> <code>act={run.claims?.act ?? "none"}</code> <code>groups={(run.claims?.groups ?? []).join(",") || "none"}</code></p>
          <ol className="steps">
            {steps.slice(0, shown).map((s, i) => (
              <li key={i} className={`step step-${s.outcome}`}>
                <strong>{OUTCOME_TEXT[s.outcome]}</strong> <code>{s.tool}</code>
                <span className="note">{s.note}</span>
                {(s.rule || s.reason) && <span className="why">{s.rule}{s.reason ? `: ${s.reason}` : ""}</span>}
                {s.approvalId && <span className="why">Approval {s.approvalId} waiting on {(s.approvers ?? []).join(", ")}</span>}
                {!s.asDesigned && <span className="why surprise">Not what the scenario expected ({s.expected}).</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
