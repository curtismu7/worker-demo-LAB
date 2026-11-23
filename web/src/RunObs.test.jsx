import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RunObs from "./RunObs.jsx";

const LAYERS = ["person", "agent", "authorize", "privilege", "gateway", "resource"];
const record = {
  runId: "r-1", window: { from: "2026-11-23T10:00:00.000Z", to: "2026-11-23T10:00:05.000Z" }, source: "mock", excerpt: true, truncated: false,
  rows: [], coverage: Object.fromEntries(LAYERS.map((l) => [l, "not-logged"])), reasons: Object.fromEntries(LAYERS.map((l) => [l, "No row in this run."])),
  partial: {}, summary: { allowed: 0, refused: 0, blocked: 0, info: 0, unverified: 0 },
};
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const bad = (status, body) => ({ ok: false, status, json: async () => body });

afterEach(() => { vi.restoreAllMocks(); });

describe("RunObs (the lab's side of the shared panel)", () => {
  it("shows a loading note, then the panel and the lab's note", async () => {
    globalThis.fetch = vi.fn(async () => ok({ record }));
    render(<RunObs source="mock" runId="r-1" stamp="done|3" />);
    expect(screen.getByTestId("ro-loading")).toBeTruthy();
    expect(await screen.findByTestId("ro-lab-note")).toBeTruthy();
    expect(globalThis.fetch.mock.calls[0][0]).toBe("/api/run-observability?runId=r-1");
  });

  const notRecords = {
    "an HTML page": { ok: true, status: 200, json: () => Promise.reject(new SyntaxError("Unexpected token <")) },
    "an empty body": { ok: true, status: 200, json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")) },
    "null": ok(null),
    "an array": ok([]),
    "a JSON string": ok("x"),
    "an object without a record": ok({}),
    "a record without rows": ok({ record: { summary: {} } }),
  };
  it.each(Object.entries(notRecords))("%s is an alert, never a stuck note or the empty state", async (_name, answer) => {
    globalThis.fetch = vi.fn(async () => answer);
    render(<RunObs source="mock" runId="r-1" stamp="done|3" />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("ro-loading")).toBeNull();
  });

  it("a refusal from the lab shows its own message as the alert", async () => {
    globalThis.fetch = vi.fn(async () => bad(409, { error: "other_mode", message: "That run was made in Real. Switch the mode to see it." }));
    render(<RunObs source="mock" runId="r-1" stamp="done|3" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/made in Real/);
  });

  it("a new status asks again, and the record it replaces is not shown while the new one loads", async () => {
    let release;
    const pending = new Promise((r) => { release = r; });
    globalThis.fetch = vi.fn().mockResolvedValueOnce(ok({ record })).mockImplementationOnce(() => pending);
    const { rerender } = render(<RunObs source="mock" runId="r-1" stamp="running|1" />);
    await screen.findByTestId("ro-lab-note");
    rerender(<RunObs source="mock" runId="r-1" stamp="done|3" />);
    expect(screen.getByTestId("ro-loading")).toBeTruthy();
    expect(screen.queryByTestId("ro-lab-note")).toBeNull();
    await act(async () => { release(ok({ record })); });
    expect(await screen.findByTestId("ro-lab-note")).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
