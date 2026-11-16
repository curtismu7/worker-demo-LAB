import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import App from "./App.jsx";

vi.mock("@xyflow/react", () => ({ ReactFlow: () => null, Background: () => null, Controls: () => null, useNodesState: (x) => [x, () => {}, () => {}], useEdgesState: (x) => [x, () => {}, () => {}] }));

// The header shows this lab's own Verified / In progress mark, read from the same /api/shelf call the Shelf link makes (through the lab-proxy that
// call reaches the shelf, whose payload lists every demo with its mark). The lab's own /api/shelf has no demos, so there is no mark then.
afterEach(() => cleanup());

const mark = (status, label, extra = {}) => ({ status, label, note: "", updatedAt: "2026-11-15", source: "shipped", ...extra });
function mockApi(shelf) {
  globalThis.fetch = vi.fn(async (url) => ({
    ok: true, status: 200,
    json: async () => (url === "/api/shelf" ? shelf : url === "/api/scenarios" ? { scenarios: [] } : url === "/api/personas" ? { personas: ["priya"] } : url === "/api/arm" ? { armed: false, expiresAt: null } : url === "/api/info" ? { mode: "mock", source: "mock", realAvailable: false } : {}),
  }));
}

describe("verification mark in the header", () => {
  it("shows this lab's own mark beside the Shelf link, and no other lab's", async () => {
    mockApi({ shelfUrl: "http://shelf.example", demos: [{ id: "other-lab", verification: mark("in-progress", "In progress") }, { id: "worker-demo", verification: mark("verified", "Verified", { note: "Every lane run on the mock" }) }] });
    render(<App />);
    const bar = within(await screen.findByTestId("top-menu"));
    expect(await bar.findByText("Verified")).toBeInTheDocument();
    expect(bar.getByRole("link", { name: "Shelf" })).toBeInTheDocument();
    expect(bar.queryByText("In progress")).toBeNull();
    expect(bar.getAllByText("Verified")).toHaveLength(1);
    expect(bar.getByText("Verified").closest(".verify")).toHaveAttribute("title", expect.stringContaining("Every lane run on the mock"));
  });

  it("shows nothing when the lab is opened on its own port (its /api/shelf has no demos) or the shelf has no mark for it", async () => {
    for (const shelf of [{ shelfUrl: "http://shelf.example" }, { shelfUrl: "http://shelf.example", demos: [{ id: "worker-demo", verification: null }] }]) {
      mockApi(shelf);
      const { unmount } = render(<App />);
      const bar = within(await screen.findByTestId("top-menu"));
      expect(await bar.findByRole("link", { name: "Shelf" })).toBeInTheDocument(); // the shelf answered, and still no badge
      expect(document.querySelector(".verify")).toBeNull();
      unmount();
    }
  });
});
