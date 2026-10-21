import { useEffect, useMemo } from "react";
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from "@xyflow/react";

const COLOR = { allow: "var(--ok)", deny: "var(--bad)", hold: "var(--warn)", error: "var(--bad)" };
const LABEL = { allow: "allowed", deny: "denied", hold: "held for approval", error: "error" };

// Person -> Agent -> Privilege PEP -> one node per tool. Boxes are draggable. `shown` is how many steps have been revealed.
export function buildGraph(run, steps, shown) {
  const nodes = [
    { id: "person", position: { x: 0, y: 120 }, data: { label: run ? `Person: ${run.claims?.sub ?? run.persona}` : "Person" }, className: "node node-actor" },
    { id: "agent", position: { x: 190, y: 120 }, data: { label: run?.claims?.act ? `Agent: ${run.claims.act}` : "Agent" }, className: "node node-actor" },
    { id: "pep", position: { x: 390, y: 120 }, data: { label: "Privilege PEP (Cedar)" }, className: "node node-pep" },
  ];
  const edges = [
    { id: "e1", source: "person", target: "agent", label: "sub", animated: false },
    { id: "e2", source: "agent", target: "pep", label: "act" },
  ];
  steps.forEach((s, i) => {
    const out = i < shown ? s.outcome : null;
    nodes.push({ id: `t${i}`, position: { x: 620, y: i * 70 }, data: { label: s.tool }, className: `node node-tool${out ? ` node-${out}` : ""}` });
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
