import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Once a test dismisses the Real-or-mock modal, later tests must find it again.
afterEach(() => { try { sessionStorage.clear(); } catch { /* storage blocked */ } });

// jsdom lacks a localStorage backing store here; the floating-dialog tests need one.
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.clear) {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; } };
}
