// The Real-or-mock modal replaces the old simulation banner: it says MOCK or REAL with this lab's own line, waits for /api/info, and comes back on a mode switch.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "./App.jsx";

vi.mock("@xyflow/react", () => ({ ReactFlow: () => null, Background: () => null, Controls: () => null, useNodesState: (x) => [x, () => {}, () => {}], useEdgesState: (x) => [x, () => {}, () => {}] }));
afterEach(() => cleanup());

const answer = (url, info) => (url === "/api/info" ? info : url === "/api/scenarios" ? { scenarios: [] } : url === "/api/personas" ? { personas: [] } : url === "/api/customer" ? { brand: { name: "Acme Power" }, defaultChannel: "teams", vocabulary: {} } : {});
const serve = (info) => { globalThis.fetch = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => answer(url, info) })); };

describe("Real-or-mock modal", () => {
  it("hosted mock: says MOCK with the hosted and simulated fact and that runs are private, and Got it closes it", async () => {
    serve({ mode: "mock", source: "mock", hosted: true, simulated: true });
    render(<App />);
    const modal = await screen.findByTestId("mode-modal");
    expect(modal).toHaveAttribute("data-mode", "mock");
    expect(modal.textContent).toMatch(/^MOCK/);
    expect(modal).toHaveTextContent(/Hosted and simulated/);
    expect(modal).toHaveTextContent(/GitHub, CloudWatch, the knowledge base and the backlog are mocks/);
    expect(modal).toHaveTextContent(/mock table inside this app that mirrors the Privilege demo/);
    expect(modal).toHaveTextContent(/mock-issued and unsigned/);
    expect(modal).toHaveTextContent(/private to this browser session/);
    fireEvent.click(screen.getByTestId("mode-modal-ok"));
    expect(screen.queryByTestId("mode-modal")).not.toBeInTheDocument();
  });

  it("local mock: says Simulated, not Hosted", async () => {
    serve({ mode: "mock", source: "mock", hosted: false, simulated: true });
    render(<App />);
    const modal = await screen.findByTestId("mode-modal");
    expect(modal).toHaveTextContent(/Simulated: GitHub/);
    expect(modal).not.toHaveTextContent(/Hosted/);
  });

  it("real: says REAL, the real PingFederate login and the local Privilege demo, and that the tools stay mocks", async () => {
    serve({ mode: "local", source: "real", hosted: false, realAvailable: true });
    render(<App />);
    const modal = await screen.findByTestId("mode-modal");
    expect(modal).toHaveAttribute("data-mode", "real");
    expect(modal.textContent).toMatch(/^REAL/);
    expect(modal).toHaveTextContent(/real PingFederate login \(pi\.flow\)/);
    expect(modal).toHaveTextContent(/local Privilege demo/);
    expect(modal).toHaveTextContent(/GitHub, CloudWatch, the knowledge base and the backlog are still mocks/);
  });

  it("shows nothing until /api/info answers (the default mode must never flash REAL), then the right mode", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    globalThis.fetch = vi.fn(async (url) => { if (url === "/api/info") await gate; return { ok: true, status: 200, json: async () => answer(url, { mode: "mock", source: "mock", hosted: true }) }; });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Acme Power" })).toBeInTheDocument());
    expect(screen.queryByTestId("mode-modal")).not.toBeInTheDocument();
    release();
    expect((await screen.findByTestId("mode-modal")).getAttribute("data-mode")).toBe("mock");
  });

  it("a mode that is dismissed stays closed for the session; switching Mock to Real shows REAL", async () => {
    const state = { mode: "mock", source: "mock", hosted: true, simulated: true, realAvailable: true };
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (url === "/api/mode" && opts?.method === "POST") { state.mode = "local"; state.source = "real"; return { ok: true, status: 200, json: async () => ({ source: "real" }) }; }
      return { ok: true, status: 200, json: async () => answer(url, { ...state }) };
    });
    render(<App />);
    fireEvent.click(await screen.findByTestId("mode-modal-ok"));
    expect(screen.queryByTestId("mode-modal")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByTestId("mode-select"), { target: { value: "real" } });
    const modal = await screen.findByTestId("mode-modal");
    expect(modal).toHaveAttribute("data-mode", "real");
  });

  it("the old simulation banner is gone in both modes (a status line such as Signed in as may still use the banner class)", async () => {
    for (const info of [{ mode: "mock", source: "mock", hosted: true }, { mode: "local", source: "real" }]) {
      serve(info);
      render(<App />);
      await screen.findByTestId("mode-modal");
      expect(document.querySelector("main p.banner")).toBeNull();
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/Real sign-in\./);
      cleanup();
      sessionStorage.clear();
    }
  });
});
