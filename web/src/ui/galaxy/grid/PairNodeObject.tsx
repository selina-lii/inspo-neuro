// A pair source in 3D: what it picks, a line each, and its one output port; its bar edits the pick, which reruns on each change.
import { useEffect } from "react";
import { nodePairs, pickQuery, type PairNode, type PairRange } from "../../../core/grid";
import { patchNode, runPick } from "../../../gridActions";
import { useStore } from "../../useStore";
import { Label3D } from "../stats/Label3D";
import { NODE_BAR, NodeShell } from "./NodeShell";

const ROW = 0.36;

const rangeText = (r: PairRange) => `${r.field === "rate" ? `${r.side} rate` : r.field} in ${r.segment} ${r.lo ?? "−∞"} … ${r.hi ?? "∞"}`;

export function PairNodeObject({ node, dark }: { node: PairNode; dark: boolean }) {
  const s = useStore();
  const query = JSON.stringify(pickQuery(node));
  useEffect(() => void runPick(node.id), [query]);
  const lines = [
    node.sessions.length ? `sessions: ${node.sessions.join(", ")}` : "every session",
    ...(node.rules.length ? node.rules.map((r) => `${r.kind}${r.name ? ` ${r.name}` : ""} is ${r.values.join(" or ") || "…"}`) : ["all pairs"]),
    ...(node.states.length ? [`state: ${node.states.join(", ")}`] : []),
    ...node.ranges.map(rangeText),
    ...(node.added.length ? [`+ ${node.added.length} added by hand`] : []),
    `${nodePairs(s, node).length} pairs`,
  ];
  return (
    <NodeShell target={{ kind: "node", id: node.id }} title="pair filter" height={NODE_BAR + lines.length * ROW + 0.1} pose={node}
      place={(patch) => patchNode(node.id, patch)} output={`node:${node.id}`} dark={dark}>
      {lines.map((text, i) => (
        <Label3D key={i} text={text} position={[0.2, -(i + 0.5) * ROW - 0.05, 0]} height={0.2} color={dark ? "#d6d9de" : "#333333"} anchor="left" bold={i === lines.length - 1} />
      ))}
    </NodeShell>
  );
}
