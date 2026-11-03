import { createRunner } from './runs.js';
import { createMockFetch } from './mockStack.js';

// Rule 13: state belongs to a workspace. Local mode has one (cfg.workspaceId, default "default"). Hosted mock mode gives every browser
// session its own, so one visitor's runs, arm switch, kill switch and Reset never touch another's. Bounded in count and idle time.
export function createWorkspaces({ cfg, fetchImpl, now = () => new Date(), max = 200, idleMs = 2 * 60 * 60 * 1000 }) {
  const spaces = new Map(); // id -> { runner, seen }
  // The mock/real choice is made per call so a rule-19 runtime switch takes effect without a restart.
  const mockFetch = createMockFetch({ now });
  const make = () => createRunner({ cfg, now, fetchImpl: (...a) => (cfg.mode === 'mock' ? mockFetch(...a) : (fetchImpl ?? fetch)(...a)) });

  function get(workspaceId) {
    const t = now().getTime();
    for (const [k, v] of spaces) if (t - v.seen > idleMs) spaces.delete(k); // idle ones go first
    let s = spaces.get(workspaceId);
    if (!s) {
      s = { runner: make(), seen: t };
      while (spaces.size >= max) spaces.delete(spaces.keys().next().value); // then the least recently used
    }
    s.seen = t;
    spaces.delete(workspaceId); spaces.set(workspaceId, s); // most recently used goes last
    return s.runner;
  }
  return { get, size: () => spaces.size };
}
