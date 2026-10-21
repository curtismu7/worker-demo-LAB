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
    json: async () => (url === "/api/scenarios" ? { scenarios: [{ id: "code-review", title: "Code review", blurb: "b", lane: "attended", stepCount: 2 }] } : url === "/api/personas" ? { personas: ["priya"] } : RUN),
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
});
