import "@testing-library/jest-dom/vitest";

// jsdom lacks a localStorage backing store here; the floating-dialog tests need one.
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.clear) {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; } };
}
