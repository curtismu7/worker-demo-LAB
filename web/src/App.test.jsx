import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App, { exchangesOf } from "./App.jsx";
import { buildGraph } from "./FlowDiagram.jsx";
import { setJsonView } from "./components/JsonPane.jsx";

vi.mock("@xyflow/react", () => ({ ReactFlow: () => null, Background: () => null, Controls: () => null, useNodesState: (x) => [x, () => {}, () => {}], useEdgesState: (x) => [x, () => {}, () => {}] }));

const RUN = { status: "done", persona: "priya", claims: { sub: "priya", act: "worker-agent", groups: ["g"] },
  steps: [{ tool: "github.read_pr", outcome: "allow", expected: "allow", asDesigned: true, note: "n" }, { tool: "github.merge_pr", outcome: "deny", expected: "deny", asDesigned: true, rule: "forbid-merge", reason: "no merge", note: "n" }] };

function mockApi() {
  globalThis.fetch = vi.fn(async (url) => ({
    ok: true, status: 200,
    json: async () => (url === "/api/scenarios" ? { scenarios: [{ id: "code-review", title: "Code review", blurb: "b", lane: "attended", stepCount: 2 }] } : url === "/api/personas" ? { personas: ["priya"] } : url === "/api/arm" ? { armed: false, expiresAt: null } : RUN),
  }));
}
afterEach(() => cleanup());

describe("App", () => {
  it("runs a scenario and reveals steps in order, deny shown with its rule", async () => {
    mockApi();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByText("github.read_pr")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Denied")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/forbid-merge/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("reset"));
    expect(screen.queryByText("github.read_pr")).not.toBeInTheDocument();
  });

  it("shows an error when the stack is down", async () => {
    globalThis.fetch = vi.fn(async (url) => (url === "/api/runs" ? { ok: false, status: 502, json: async () => ({ error: "issuer_down", reason: "stub issuer down" }) }
      : { ok: true, status: 200, json: async () => (url === "/api/scenarios" ? { scenarios: [{ id: "a", title: "A", blurb: "", lane: "attended", stepCount: 1 }] } : { personas: ["p"] }) }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("stub issuer down"));
  });
});

describe("buildGraph", () => {
  it("colours only the revealed steps", () => {
    const g = buildGraph(RUN, RUN.steps, 1);
    expect(g.nodes.find((n) => n.id === "t0").className).toContain("node-allow");
    expect(g.nodes.find((n) => n.id === "t1").className).not.toContain("node-deny");
    expect(buildGraph(RUN, RUN.steps, 2).nodes.find((n) => n.id === "t1").className).toContain("node-deny");
  });

  it("delegated steps add one node per source agent", () => {
    const steps = [{ agent: "a1", tool: "t.one", outcome: "allow" }, { agent: "a2", tool: "t.two", outcome: "deny" }, { agent: "a1", tool: "t.three", outcome: "allow" }];
    const ids = buildGraph({ claims: {} }, steps, 3).nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(["a-a1", "a-a2", "t0", "t1", "t2"]));
    expect(ids.filter((i) => i.startsWith("a-"))).toHaveLength(2);
  });
});

describe("suggested persona", () => {
  it("signs in as the scenario's own person when the scenario changes", async () => {
    globalThis.fetch = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (
      url === "/api/scenarios" ? { scenarios: [{ id: "a", title: "A", blurb: "", lane: "attended", persona: "eli", stepCount: 1 }, { id: "b", title: "B", blurb: "", lane: "attended", persona: "ben", stepCount: 1 }] }
        : url === "/api/personas" ? { personas: ["eli", "ben", "priya"] } : { armed: false }) }));
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("Signed in as")).toHaveValue("eli"));
    fireEvent.change(screen.getByLabelText("Scenario"), { target: { value: "b" } });
    expect(screen.getByLabelText("Signed in as")).toHaveValue("ben");
  });
});

describe("unattended lane", () => {
  it("cannot run until armed, and the switch arms it", async () => {
    let armed = false;
    globalThis.fetch = vi.fn(async (url, init) => ({
      ok: true, status: 200,
      json: async () => (url === "/api/scenarios" ? { scenarios: [{ id: "sweep", title: "Sweep", blurb: "b", lane: "unattended", stepCount: 1 }] }
        : url === "/api/personas" ? { personas: ["priya"] }
          : url === "/api/arm" ? (init?.method === "POST" ? (armed = JSON.parse(init.body).armed, { armed, expiresAt: new Date(Date.now() + 3600000).toISOString() }) : { armed, expiresAt: null }) : {}),
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("switch")).toBeInTheDocument());
    expect(screen.getByText(/Triggered by a schedule/)).toBeInTheDocument(); // no chat channel for a schedule
    expect(screen.getByLabelText("Signed in as")).toBeDisabled(); // nobody is signed in
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
  });
});

describe("parked run", () => {
  const PARKED = { id: "r1", status: "parked", persona: "mark", unattended: false, claims: { sub: "mark", act: "worker-agent", groups: [] },
    steps: [{ index: 0, tool: "backlog.update_story", outcome: "hold", expected: "hold", asDesigned: true, approvalId: "A1", approvers: ["priya"], note: "n" }] };
  it("shows the approval card, approves as the chosen approver and shows the retry", async () => {
    const posts = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      if (init?.method === "POST" && url.includes("/resolve")) { posts.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ ...PARKED, status: "done", steps: [...PARKED.steps, { index: 0, ranOnApproval: true, tool: "backlog.update_story", outcome: "allow", expected: "allow", asDesigned: true, note: "r" }] }) }; }
      return { ok: true, status: 200, json: async () => (url === "/api/scenarios" ? { scenarios: [{ id: "s", title: "S", blurb: "", lane: "attended", stepCount: 1 }] } : url === "/api/personas" ? { personas: ["mark", "priya"] } : url === "/api/arm" ? { armed: false } : PARKED) };
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByRole("group", { name: "Approval needed" })).toBeInTheDocument(), { timeout: 3000 });
    // One primary per view state: while a person has to decide, Approve is the primary and Run is not.
    expect([...document.querySelectorAll("button.primary")].map((b) => b.textContent)).toEqual(["Approve"]);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByText(/Ran on approval: Allowed/)).toBeInTheDocument(), { timeout: 3000 });
    expect(posts).toEqual([{ decision: "approve", approver: "priya" }]);
    expect(screen.queryByRole("group", { name: "Approval needed" })).not.toBeInTheDocument();
    expect([...document.querySelectorAll("button.primary")].map((b) => b.textContent)).toEqual(["Run"]);
  });

  // Rule 27 (W1): after a no-reply or a refused approval the run's status and step count do not change, so the panel must still
  // re-read its record. Otherwise the panel keeps showing the record from before the answer.
  it("a no-reply approval re-reads the panel's record, so the no-reply is shown and the old record is not", async () => {
    const LAYER_IDS = ["person", "agent", "authorize", "privilege", "gateway", "resource"];
    const recordFor = (privilegeReason) => ({ runId: "r1", window: { from: "2026-11-23T10:00:00.000Z", to: "2026-11-23T10:00:05.000Z" }, source: "real", excerpt: true, truncated: false, rows: [],
      coverage: Object.fromEntries(LAYER_IDS.map((l) => [l, "not-logged"])), reasons: { ...Object.fromEntries(LAYER_IDS.map((l) => [l, "No row in this run."])), privilege: privilegeReason },
      partial: {}, summary: { allowed: 0, refused: 0, blocked: 0, info: 0, unverified: 0 } });
    const NO_REPLY = "1 call got no reply from the Privilege demo (it did not connect, or it timed out), so it has no row: the record is partial.";
    let answered = false;
    const recordCalls = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      if (url.startsWith("/api/run-observability")) { recordCalls.push(url); return { ok: true, status: 200, json: async () => ({ record: recordFor(answered ? NO_REPLY : "No row in this run.") }) }; }
      if (init?.method === "POST" && url.includes("/resolve")) { answered = true; return { ok: false, status: 502, json: async () => ({ error: "pep_down", message: "The Privilege demo did not answer." }) }; }
      const parked = { ...PARKED, steps: [{ ...PARKED.steps[0], ...(answered ? { noReply: { decision: "approve", by: "priya" } } : {}) }] };
      return { ok: true, status: 200, json: async () => (url === "/api/scenarios" ? { scenarios: [{ id: "s", title: "S", blurb: "", lane: "attended", stepCount: 1 }] } : url === "/api/personas" ? { personas: ["mark", "priya"] } : url === "/api/arm" ? { armed: false } : parked) };
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByRole("group", { name: "Approval needed" })).toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(recordCalls.length).toBeGreaterThanOrEqual(2), { timeout: 3000 });
    await waitFor(() => expect(screen.getByTestId("ro-reason-privilege")).toHaveTextContent("got no reply"), { timeout: 3000 });
  });
});

describe("shell bar", () => {
  it("brand, Mock badge, the current page pill and the TopMenu in header.shell-bar; the banner opens <main>; Run is the one primary", async () => {
    mockApi();
    const base = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init) => (url === "/api/info" ? { ok: true, status: 200, json: async () => ({ mode: "mock", source: "mock", realAvailable: false }) } : base(url, init)));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    await waitFor(() => expect(screen.getByTestId("mode-badge")).toHaveTextContent("Mock"));
    const bar = document.querySelector("header.shell-bar");
    expect(bar).not.toBeNull();
    expect(bar.querySelector(".shell-brand h1")).toHaveTextContent("Worker agent demo");
    expect(bar.querySelector("[data-testid=mode-badge]")).not.toBeNull();
    expect(bar.querySelector('.shell-nav a[aria-current="page"]')).toHaveTextContent("Worker agent");
    expect(bar.querySelector("[data-testid=top-menu]")).toHaveClass("shell-right");
    expect(document.querySelector("main").firstElementChild).toHaveClass("banner");
    expect([...document.querySelectorAll("button.primary")].map((b) => b.textContent)).toEqual(["Run"]);
  });
});

describe("channel, presenter and tokens", () => {
  const SC = { id: "code-review", title: "Code review", blurb: "b", lane: "attended", stepCount: 1, prompt: "Review PR 42.", talk: ["Reads are allowed.", "Merge is refused."] };
  const R = { id: "r", status: "done", persona: "priya", claims: { sub: "priya", act: "worker-agent", groups: [] }, steps: [{ index: 0, tool: "github.read_pr", outcome: "allow", expected: "allow", asDesigned: true, note: "n" }],
    tokens: [{ agent: "worker-agent", scope: null, mock: true, jwt: "aaa.bbb.ccc", claims: { sub: "priya", act: "worker-agent" } }] };
  it("always shows the simulated banner, the channel frame, and the talk track only in presenter mode", async () => {
    globalThis.fetch = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (
      url === "/api/scenarios" ? { scenarios: [SC] } : url === "/api/personas" ? { personas: ["priya"] } : url === "/api/arm" ? { armed: false }
        : url === "/api/channels" ? { channels: [{ id: "teams", name: "Microsoft Teams", how: "h", identity: "Authenticate the user through Ping." }, { id: "hr-chatbot", name: "HR chatbot (existing site)", how: "h2", identity: "i2" }] }
          : url === "/api/customer" ? { brand: { name: "Acme Power" }, defaultChannel: "teams", vocabulary: {} } : R) }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Acme Power" })).toBeInTheDocument());
    expect(screen.getByRole("note")).toHaveTextContent(/Simulated|Real sign-in/);
    await waitFor(() => expect(screen.getByRole("region", { name: "Asked in Microsoft Teams" })).toHaveTextContent("Review PR 42."));
    expect(screen.queryByRole("complementary", { name: "Talk track" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Presenter" }));
    expect(screen.getByRole("complementary", { name: "Talk track" })).toHaveTextContent("Merge is refused.");
    expect(screen.getByRole("note")).toBeInTheDocument(); // still shown in presenter mode
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "hr-chatbot" } });
    expect(screen.getByRole("region", { name: "Asked in HR chatbot (existing site)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByText("aaa.bbb.ccc")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/mock-issued/)).toBeInTheDocument();
    // The decoded claims go through the shared JsonPane: Form | JSON, full view.
    setJsonView("form");
    fireEvent.click(screen.getByRole("button", { name: "Form" }));
    expect(screen.getByRole("group", { name: "Decoded claims" })).toHaveTextContent("worker-agent");
    expect(screen.getByRole("group", { name: "Decoded claims view" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(screen.getByLabelText("Decoded claims", { selector: "pre" })).toHaveTextContent('"act": "worker-agent"');
    setJsonView("form");
  });
});

describe("hosted mock banner", () => {
  it("says hosted and simulated, and that runs are private, when the build is mock", async () => {
    globalThis.fetch = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (
      url === "/api/info" ? { mode: "mock", hosted: true, simulated: true } : url === "/api/scenarios" ? { scenarios: [] } : url === "/api/personas" ? { personas: [] } : { armed: false }) }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("note")).toHaveTextContent(/Hosted and simulated/));
    expect(screen.getByRole("note")).toHaveTextContent(/private to this browser session/);
  });
});

describe("mode toggle", () => {
  it("Mock pressed by default; Real posts {source:'real'} and the info re-fetch flips the pressed states; unconfigured Real is disabled with the how-to", async () => {
    const state = { mode: "mock", hosted: true, simulated: true, realAvailable: true };
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (url === "/api/mode" && opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        state.mode = body.source === "real" ? "local" : "mock";
        return { ok: true, status: 200, json: async () => ({ source: body.source }) };
      }
      return { ok: true, status: 200, json: async () => (
        url === "/api/info" ? { ...state } : url === "/api/scenarios" ? { scenarios: [] } : url === "/api/personas" ? { personas: [] }
          : url === "/api/customer" ? { brand: { name: "Acme Power" }, defaultChannel: "teams", vocabulary: {} } : {}) };
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Acme Power" })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("mode-select")).toHaveValue("mock"));
    fireEvent.change(screen.getByTestId("mode-select"), { target: { value: "real" } });
    await waitFor(() => expect(screen.getByTestId("mode-select")).toHaveValue("real"));
  });

  it("Real is disabled with a title when the server reports realAvailable: false", async () => {
    globalThis.fetch = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (
      url === "/api/info" ? { mode: "mock", hosted: true, simulated: true, realAvailable: false } : url === "/api/scenarios" ? { scenarios: [] } : url === "/api/personas" ? { personas: [] }
        : url === "/api/customer" ? { brand: { name: "Acme Power" }, defaultChannel: "teams", vocabulary: {} } : {}) }));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("mode-select").querySelector('option[value="real"]')).toBeDisabled());
    expect(screen.getByTestId("mode-select").querySelector('option[value="real"]')).toHaveAttribute("title");
  });
});

describe("What Privilege did (Rule 25)", () => {
  const trace = (source, status, rule) => ({
    source,
    request: { method: "POST", url: "http://mock.invalid/mcp", headers: { "content-type": "application/json" }, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "github.merge_pr", arguments: {} } } },
    response: { status, headers: {}, body: { jsonrpc: "2.0", id: 1, error: { code: -32003, message: "denied by policy", data: { rule } } } },
    decisions: [{ id: "policy", label: "Policy", outcome: "fail", basis: source === "mock" ? "checked" : "observed", evidence: `deny by ${rule}` }],
    record: null,
  });
  const TRACED = { id: "r1", status: "parked", persona: "mark", unattended: false, claims: { sub: "mark", act: "worker-agent", groups: [] },
    steps: [{ index: 0, tool: "github.merge_pr", outcome: "deny", expected: "deny", asDesigned: true, rule: "u20", note: "n", trace: trace("mock", 200, "u20") },
      { index: 1, tool: "backlog.update_story", outcome: "hold", expected: "hold", asDesigned: true, approvalId: "A1", approvers: ["priya"], note: "n", trace: trace("mock", 200, "u30"),
        refused: { decision: "approve", by: "mark", reason: "no", trace: { ...trace("mock", 403, "x"), request: { method: "POST", url: "http://mock.invalid/api/approvals/A1/approve", headers: {}, body: {} } } } }] };

  it("numbers one exchange per call in order: the call, the refused approval, the approval", () => {
    const withApproval = [{ ...TRACED.steps[1], approvalCall: { decision: "approve", by: "priya", trace: trace("mock", 200, "u30") } }];
    expect(exchangesOf(withApproval).map((e) => [e.step, e.title, e.status])).toEqual([
      [1, "Agent calls backlog.update_story", 200], [2, "mark tries to approve: refused", 403], [3, "priya approves the held call", 200]]);
    expect(exchangesOf([{ tool: "x", outcome: "allow" }])).toEqual([]);
  });

  it("a no-reply approval is a no-reply exchange, never a refusal", () => {
    const noReply = [{ ...TRACED.steps[1], refused: undefined, noReply: { decision: "approve", by: "priya", trace: { ...trace("mock", null, "x"), response: null } } }];
    const list = exchangesOf(noReply);
    expect(list.map((e) => [e.step, e.title, e.status])).toEqual([[1, "Agent calls backlog.update_story", 200], [2, "priya tries to approve: no reply from the Privilege demo", null]]);
    expect(list.some((e) => /refused/.test(e.title))).toBe(false);
  });

  it("shows the panel under the run, with the mock basis, after a Run", async () => {
    globalThis.fetch = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (url === "/api/scenarios" ? { scenarios: [{ id: "s", title: "S", blurb: "", lane: "attended", stepCount: 2 }] } : url === "/api/personas" ? { personas: ["mark", "priya"] } : url === "/api/arm" ? { armed: false } : url === "/api/info" ? { mode: "mock", source: "mock" } : TRACED) }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByTestId("trace-3")).toBeInTheDocument(), { timeout: 4000 });
    expect(screen.getByTestId("gateway-trace")).toBeInTheDocument();
    expect(screen.getByTestId("gateway-trace-basis")).toHaveTextContent(/Simulated: this app's in-process copy/);
    expect(screen.getByTestId("trace-1")).toHaveTextContent("Agent calls github.merge_pr");
    expect(screen.getByTestId("trace-1")).toHaveTextContent("deny by u20");
    expect(screen.getByTestId("trace-3")).toHaveTextContent("mark tries to approve: refused");
  });
});
