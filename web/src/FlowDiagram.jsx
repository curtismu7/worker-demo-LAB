import { useEffect, useMemo } from "react";
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from "@xyflow/react";

const COLOR = { allow: "var(--status-ok)", deny: "var(--danger-text)", hold: "var(--status-warn)", error: "var(--danger-text)" };
const LABEL = { allow: "allowed", deny: "denied", hold: "held for approval", error: "error" };

// Person -> Agent -> Privilege PEP -> one node per tool. Boxes are draggable. `shown` is how many steps have been revealed.
export function buildGraph(run, steps, shown) {
  // Attended steps have no `agent` of their own, so the one acting agent sits between the person and the PEP.
  // Delegated and unattended steps name their agent: one node per distinct agent, all between the lead agent and the PEP.
  const agents = [...new Set(steps.map((s) => s.agent).filter(Boolean))];
  const multi = agents.length > 1;
  const pepX = multi ? 600 : 390;
  const toolX = multi ? 840 : 620;
  const nodes = [
    { id: "person", position: { x: 0, y: 120 }, data: { label: run?.unattended ? "No person present" : run ? `Person: ${run.claims?.sub ?? run.persona}` : "Person" }, className: `node node-actor${run?.unattended ? " node-muted" : ""}` },
    { id: "agent", position: { x: 190, y: 120 }, data: { label: multi ? "Collector agent" : run?.unattended ? `Agent: ${run.claims?.sub ?? "agent"}` : run?.claims?.act ? `Agent: ${run.claims.act}` : "Agent" }, className: "node node-actor" },
    { id: "pep", position: { x: pepX, y: 120 }, data: { label: "Privilege PEP (Cedar)" }, className: "node node-pep" },
  ];
  const edges = [{ id: "e1", source: "person", target: "agent", label: run?.unattended ? "schedule" : "sub" }];
  if (multi) {
    agents.forEach((a, i) => {
      nodes.push({ id: `a-${a}`, position: { x: 390, y: i * 90 }, data: { label: a }, className: "node node-actor" });
      edges.push({ id: `ea-${a}`, source: "agent", target: `a-${a}`, label: "act" }, { id: `ep-${a}`, source: `a-${a}`, target: "pep" });
    });
  } else edges.push({ id: "e2", source: "agent", target: "pep", label: run?.unattended ? "sub" : "act" });
  steps.forEach((s, i) => {
    const out = i < shown ? s.outcome : null;
    nodes.push({ id: `t${i}`, position: { x: toolX, y: i * 70 }, data: { label: s.tool }, className: `node node-tool${out ? ` node-${out}` : ""}` });
    edges.push({
      id: `et${i}`, source: "pep", target: `t${i}`, label: out ? LABEL[out] : "",
      style: out ? { stroke: COLOR[out], strokeWidth: 2 } : { strokeDasharray: "4 4" }, animated: i === shown - 1 && out === "allow",
    });
  });
  // Left-to-right flow: edges leave the right side of a box and enter the left side of the next.
  return { nodes: nodes.map((n) => ({ ...n, sourcePosition: "right", targetPosition: "left" })), edges };
}

export default function FlowDiagram({ run, steps, shown, resetKey }) {
  const graph = useMemo(() => buildGraph(run, steps, shown), [run, steps, shown]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  // Keep any positions the user dragged; only data and styling follow the run.
  useEffect(() => {
    setNodes((cur) => graph.nodes.map((n) => ({ ...n, position: cur.find((c) => c.id === n.id)?.position ?? n.position })));
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);
  // Reset puts every box back where it started.
  useEffect(() => { setNodes(graph.nodes); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flow" role="img" aria-label="Diagram: person, agent, policy enforcement point and the tools it called">
      <ReactFlow key={steps.length} nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView nodesDraggable proOptions={{ hideAttribution: true }}>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
