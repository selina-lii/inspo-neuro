// A pair node in 3D: input port on the left takes a board or a network, output port on the right feeds grids; a row per mode.
import type { PairMode, PairNode } from "../../../core/grid";
import { patchNode } from "../../../gridActions";
import { Label3D } from "../stats/Label3D";
import { NODE_BAR, NODE_W, NodeShell } from "./NodeShell";

const ROW = 0.42;
const MODES: [PairMode, string][] = [["all", "all pairs"], ["selected", "selected pairs"], ["picked", "picked dots"]];

export function PairNodeObject({ node, dark }: { node: PairNode; dark: boolean }) {
  return (
    <NodeShell target={{ kind: "node", id: node.id }} title="pair filter" height={NODE_BAR + MODES.length * ROW + 0.1} pose={node}
      place={(patch) => patchNode(node.id, patch)} input={`in:${node.id}`} output={`node:${node.id}`} dark={dark}>
      {MODES.map(([mode, label], i) => {
        const on = node.mode === mode;
        const y = -(i + 0.5) * ROW - 0.05;
        return (
          <group key={mode}>
            <mesh position={[NODE_W / 2, y, -0.01]} onClick={(e) => e.delta <= 4 && (e.stopPropagation(), patchNode(node.id, { mode }))}>
              <planeGeometry args={[NODE_W - 0.2, ROW - 0.06]} />
              <meshBasicMaterial color={on ? "#3a6df0" : dark ? "#2c313a" : "#eef1f6"} side={2} />
            </mesh>
            <Label3D text={`${on ? "●" : "○"}  ${label}`} position={[0.25, y, 0]} height={0.22} color={on ? "#ffffff" : dark ? "#d6d9de" : "#333333"} anchor="left" />
          </group>
        );
      })}
    </NodeShell>
  );
}

