// Shows which mode the server is running and offers the other one. The page cannot switch the server: a hosted build fails closed,
// so Mock and Real are set by how the server was started. The unavailable option is disabled and says how to start it.
const REAL_HOW = "Real needs the server started with MODE unset (or MODE=local) and the Privilege demo running on its port. Restart the server to change modes.";
const MOCK_HOW = "Mock is the hosted simulation. Restart the server with MODE=mock to switch to it.";

export default function ModeToggle({ mode }) {
  const mock = mode === "mock";
  const real = mode === "local";
  return (
    <div className="mode-toggle" role="group" aria-label="Mode" data-testid="mode">
      <button type="button" aria-pressed={mock} disabled={real} title={real ? MOCK_HOW : undefined} data-testid="mode-mock">Mock</button>
      <button type="button" aria-pressed={real} disabled={mock} title={mock ? REAL_HOW : undefined} data-testid="mode-real">Real</button>
    </div>
  );
}
