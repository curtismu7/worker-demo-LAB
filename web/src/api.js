async function j(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.reason || body.error || `HTTP ${res.status}`), { code: body.error });
  return body;
}
export const getScenarios = () => fetch("/api/scenarios").then(j);
export const getPersonas = () => fetch("/api/personas").then(j);
export const startRun = (scenario, persona) =>
  fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario, persona }) }).then(j);
export const getArm = () => fetch("/api/arm").then(j);
export const setArm = (armed) =>
  fetch("/api/arm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ armed }) }).then(j);
