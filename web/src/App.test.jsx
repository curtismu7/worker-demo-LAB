import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "./App.jsx";
import { buildGraph } from "./FlowDiagram.jsx";

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
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
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
      if (init?.method === "POST" && url.includes("/resolve")) { posts.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ ...PARKED, status: "done", steps: [...PARKED.steps, { index: 0, retry: true, tool: "backlog.update_story", outcome: "allow", expected: "allow", asDesigned: true, note: "r" }] }) }; }
      return { ok: true, status: 200, json: async () => (url === "/api/scenarios" ? { scenarios: [{ id: "s", title: "S", blurb: "", lane: "attended", stepCount: 1 }] } : url === "/api/personas" ? { personas: ["mark", "priya"] } : url === "/api/arm" ? { armed: false } : PARKED) };
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByRole("group", { name: "Approval needed" })).toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByText(/Retried: Allowed/)).toBeInTheDocument(), { timeout: 3000 });
    expect(posts).toEqual([{ decision: "approve", approver: "priya" }]);
    expect(screen.queryByRole("group", { name: "Approval needed" })).not.toBeInTheDocument();
  });
});
