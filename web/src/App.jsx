import { useEffect, useRef, useState } from "react";
import FlowDiagram from "./FlowDiagram.jsx";
import ChannelFrame from "./ChannelFrame.jsx";
import TokenPanel from "./TokenPanel.jsx";
import { getArm, getChannels, getCustomer, getInfo, getPersonas, getRun, getScenarios, kill, resetServer, resolveRun, setArm, startRun } from "./api.js";
import ModeToggle from "./ModeToggle.jsx";

const SPEEDS = [0.5, 1, 2, 4];
const LANES = { attended: "Attended", delegated: "Delegated (agent to agent)", unattended: "Unattended" };
const OUTCOME_TEXT = { allow: "Allowed", deny: "Denied", hold: "Held for approval", error: "Error" };
const STATUS_TEXT = { parked: "waiting for a person", done: "done", failed: "failed", denied: "approval denied", expired: "stopped waiting", cancelled: "cancelled by kill switch", running: "running" };

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
  const [approver, setApprover] = useState("");
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState("");
  const [customer, setCustomer] = useState({ brand: { name: "Worker agent demo" }, vocabulary: { person: "Person", agent: "Agent" } });
  const [presenter, setPresenter] = useState(false);
  const [info, setInfo] = useState({ mode: "local", hosted: false });
  const [arm, setArmState] = useState({ armed: false, expiresAt: null });
  const timer = useRef(null);

  useEffect(() => {
    Promise.all([getScenarios(), getPersonas()]).then(([s, p]) => {
      setScenarios(s.scenarios); setPersonas(p.personas); setApprover(p.personas.includes("priya") ? "priya" : p.personas[0] ?? "");
      setScenarioId(s.scenarios[0]?.id ?? ""); setPersona(p.personas.includes(s.scenarios[0]?.persona) ? s.scenarios[0].persona : p.personas[0] ?? "");
    }).catch((e) => setError(e.message));
    getArm().then(setArmState).catch(() => {});
    getInfo().then((i) => { if (i?.mode) setInfo(i); }).catch(() => {});
    Promise.all([getChannels(), getCustomer()]).then(([c, cu]) => { setChannels(Array.isArray(c?.channels) ? c.channels : []); if (cu?.brand?.name) setCustomer(cu); setChannelId(cu?.defaultChannel ?? ""); }).catch(() => {});
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
    try { const r = await startRun(scenarioId, needsArm ? undefined : persona); setRun(r); play(r.steps.length); } catch (e) { setError(e.message); setRun(null); } finally { setBusy(false); }
  }
  async function onResolve(decision) {
    const before = run.steps.length;
    setBusy(true); setError("");
    try { const r = await resolveRun(run.id, decision, approver); setRun(r); play(r.steps.length, before); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function onKill() {
    setError("");
    try {
      setArmState(await kill());
      if (run) { clearTimeout(timer.current); const r = await getRun(run.id); setRun(r); setShown(r.steps.length); }
    } catch (e) { setError(e.message); }
  }
  const onSimulate = () => run && play(run.steps.length);
  const onReset = () => { resetServer().catch(() => {}); clearTimeout(timer.current); setRun(null); setShown(0); setError(""); setResetKey((k) => k + 1); };
  const sc = scenarios.find((s) => s.id === scenarioId);
  // Each scenario is written for one person; switching scenario signs in as them (still changeable).
  function onScenario(id) {
    setScenarioId(id);
    const s = scenarios.find((x) => x.id === id);
    if (s?.persona && personas.includes(s.persona)) setPersona(s.persona);
  }
  const channel = channels.find((c) => c.id === channelId) ?? channels[0];
  const needsArm = sc?.lane === "unattended";
  const onArm = () => setArm(!arm.armed).then(setArmState).catch((e) => setError(e.message));

  return (
    <main className={`page${presenter ? " presenter" : ""}`}>
      <p className="banner" role="note">
        {info.mode === "mock"
          ? <><strong>Hosted and simulated.</strong> GitHub, CloudWatch, the knowledge base and the backlog are mocks. Policy decisions come from a mock table inside this app that mirrors the Privilege demo, and tokens are mock-issued and unsigned. Your runs are private to this browser session.</>
          : <><strong>Simulated.</strong> GitHub, CloudWatch, the knowledge base and the backlog are mocks. Tokens come from a local stub issuer, not PingFederate. Policy decisions come from the local Privilege demo.</>}
      </p>
      <header>
        <h1>{customer.brand.name}</h1>
        <ModeToggle mode={info.mode} />
        <p className="lede">An agent acts for a signed-in person. Every tool call it makes goes through the Privilege policy enforcement point, which allows it, denies it, or holds it for a human. <strong>Mock mode:</strong> GitHub, the knowledge base and the backlog are simulated.</p>
      </header>

      <section className="controls" aria-label="Run controls">
        <label>Scenario
          <select value={scenarioId} onChange={(e) => onScenario(e.target.value)}>
            {Object.entries(LANES).map(([lane, name]) => (
              <optgroup key={lane} label={name}>{scenarios.filter((s) => s.lane === lane).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</optgroup>
            ))}
          </select>
        </label>
        <label>Signed in as
          <select value={needsArm ? "" : persona} disabled={needsArm} onChange={(e) => setPersona(e.target.value)}>{needsArm ? <option value="">nobody (the agent runs alone)</option> : personas.map((p) => <option key={p}>{p}</option>)}</select>
        </label>
        <label>Channel
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>{channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label>Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}</select>
        </label>
        <button className="primary" onClick={onRun} disabled={busy || !scenarioId || (!needsArm && !persona) || (needsArm && !arm.armed)}>{busy ? "Running…" : "Run"}</button>
        <button onClick={onSimulate} disabled={!run}>Simulate again</button>
        <button onClick={onReset}>Reset</button>
        <button aria-pressed={presenter} onClick={() => setPresenter((p) => !p)}>Presenter</button>
        <button className="danger" onClick={onKill}>Kill switch</button>
      </section>
      {sc && <p className="blurb">{sc.blurb}</p>}
      {needsArm
        ? <p className="channel-how">Triggered by a schedule: {sc?.prompt} No person, no channel.</p>
        : <ChannelFrame channel={channel} prompt={sc?.prompt} person={run?.claims?.sub ?? persona} />}
      {presenter && sc?.talk?.length > 0 && (
        <aside className="talk" aria-label="Talk track">
          <h2>Talk track</h2>
          <ul>{sc.talk.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </aside>
      )}
      {needsArm && (
        <p className="arm">
          <button role="switch" aria-checked={arm.armed} onClick={onArm}>{arm.armed ? "Armed" : "Disarmed"}</button>{" "}
          {arm.armed ? `Unattended runs may fire until ${new Date(arm.expiresAt).toLocaleTimeString()} (one hour).` : "Unattended runs are off. Arm them to let the schedule fire without a person."}
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      <FlowDiagram key={run?.scenario ?? "none"} run={run} steps={steps} shown={shown} resetKey={resetKey} />

      {run && (
        <section aria-label="Run trace">
          <h2>Trace <span className={`status status-${run.status}`}>{STATUS_TEXT[run.status] ?? run.status}</span></h2>
          <p className="claims">{run.unattended ? "Unattended: no person in the session. " : ""}Token: <code>sub={run.claims?.sub}</code> <code>act={run.claims?.act ?? "none"}</code> <code>groups={(run.claims?.groups ?? []).join(",") || "none"}</code></p>
          {run.status === "parked" && shown >= steps.length && (
            <div className="approval" role="group" aria-label="Approval needed">
              <p><strong>A person has to decide.</strong> The run is parked on <code>{steps.at(-1)?.tool}</code>. Approvers: {(steps.at(-1)?.approvers ?? []).join(", ") || "unknown"}. Nobody can approve their own call.</p>
              <label>Decide as
                <select value={approver} onChange={(e) => setApprover(e.target.value)}>{personas.map((p) => <option key={p}>{p}</option>)}</select>
              </label>
              <button className="primary" disabled={busy} onClick={() => onResolve("approve")}>Approve</button>
              <button disabled={busy} onClick={() => onResolve("deny")}>Deny</button>
              <button disabled={busy} onClick={() => onResolve("expire")}>Stop waiting</button>
            </div>
          )}
          <ol className="steps">
            {steps.slice(0, shown).map((s, i) => (
              <li key={i} className={`step step-${s.outcome}`}>
                <strong>{s.ranOnApproval ? "Ran on approval: " : ""}{OUTCOME_TEXT[s.outcome]}</strong> <code>{s.tool}</code>{s.agent && <span className="agent"> by {s.agent}{s.scope ? ` (${s.scope})` : ""}</span>}
                <span className="note">{s.note}</span>
                {(s.rule || s.reason) && <span className="why">{s.rule}{s.reason ? `: ${s.reason}` : ""}</span>}
                {s.approvalId && <span className="why">Approval {s.approvalId} waiting on {(s.approvers ?? []).join(", ")}</span>}
                {s.resolution && <span className="why">{s.resolution.decision === "approve" ? "Approved" : "Denied"} by {s.resolution.by}.</span>}
                {!s.asDesigned && <span className="why surprise">Not what the scenario expected ({s.expected}).</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {run && <TokenPanel tokens={run.tokens} mock={info.mode === "mock"} />}
    </main>
  );
}
