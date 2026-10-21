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
export const getRun = (id) => fetch(`/api/runs/${id}`).then(j);
export const kill = () => fetch("/api/kill", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(j);
export const resolveRun = (id, decision, approver) =>
  fetch(`/api/runs/${id}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, approver }) }).then(j);
export const getCustomer = () => fetch("/api/customer").then(j);
export const getChannels = () => fetch("/api/channels").then(j);
export const resetServer = () => fetch("/api/reset", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(j);
