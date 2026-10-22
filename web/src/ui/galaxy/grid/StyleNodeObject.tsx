// A curve style node in 3D: each segment its grids draw, top layer first, in its colour; its bar edits them.
import type { StyleNode } from "../../../core/grid";
import type { State } from "../../../core/store";
import { patchStyle } from "../../../gridActions";
import { gridKey } from "../../panel/Legend";
import { useStore } from "../../useStore";
import { Label3D } from "../stats/Label3D";
import { NODE_BAR, NodeShell } from "./NodeShell";

const ROW = 0.36;

/** The segments the node's grids draw, as [label, colour], bottom layer first. */
export function styleLabels(s: State, node: StyleNode): [string, string][] {
  const drawn = new Map(s.grids.filter((g) => g.style === node.id).flatMap((g) => gridKey(s, g)));
  const styled = node.curves.map((c): [string, string] => [c.label, c.color]);
  return [...[...drawn].filter(([l]) => !node.curves.some((c) => c.label === l)), ...styled];
}

export function StyleNodeObject({ node, dark }: { node: StyleNode; dark: boolean }) {
  const s = useStore();
  const lines = styleLabels(s, node).reverse();
  const width = (label: string) => node.curves.find((c) => c.label === label);
  return (
    <NodeShell target={{ kind: "style", id: node.id }} title={node.label || "curve style"} height={NODE_BAR + Math.max(lines.length, 1) * ROW + 0.1} pose={node}
      place={(patch) => patchStyle(node.id, patch)} output={`style:${node.id}`} dark={dark}>
      {lines.length ? lines.map(([label, color], i) => (
        <Label3D key={label} text={`━━ ${label}${width(label) ? ` · ${width(label)!.width}px · ${Math.round(width(label)!.alpha * 100)}%` : ""}`}
          position={[0.2, -(i + 0.5) * ROW - 0.05, 0]} height={0.2} color={color} anchor="left" bold />
      )) : <Label3D text="cable it to a grid" position={[0.2, -0.5 * ROW - 0.05, 0]} height={0.2} color={dark ? "#d6d9de" : "#333333"} anchor="left" />}
    </NodeShell>
  );
}
