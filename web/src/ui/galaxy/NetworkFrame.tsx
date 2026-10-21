// A network's selection box: an outline round its neurons and a title bar above it. Click the bar to select the network
// (pink outline, corner ticks where it can be resized); drag it to move a network that can move; Delete closes it.
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { PICK_COLOR } from "../../core/colors";
import { Label3D } from "./stats/Label3D";

const BAR = 0.6;

type Props = {
  box: [number, number, number, number]; z: number; label: string; picked: boolean; onPick(): void; onMenu(): void;
  drag?: Record<string, (e: ThreeEvent<PointerEvent>) => void>;
};

export function NetworkFrame({ box: [x0, y0, x1, y1], z, label, picked, onPick, onMenu, drag }: Props) {
  const outline = useMemo(() => new BufferGeometry().setAttribute("position", new Float32BufferAttribute([
    x0, y0, z, x1, y0, z, x1, y0, z, x1, y1 + BAR, z, x1, y1 + BAR, z, x0, y1 + BAR, z, x0, y1 + BAR, z, x0, y0, z,
  ], 3)), [x0, y0, x1, y1, z]);
  return (
    <group onContextMenu={onMenu}>
      <lineSegments geometry={outline}>
        <lineBasicMaterial color={picked ? PICK_COLOR : "#3a6df0"} transparent opacity={picked ? 1 : 0.45} />
      </lineSegments>
      <mesh position={[(x0 + x1) / 2, y1 + BAR / 2, z]} {...drag} onClick={(e) => e.delta <= 4 && (e.stopPropagation(), onPick())}>
        <planeGeometry args={[x1 - x0, BAR]} />
        <meshBasicMaterial color={picked ? PICK_COLOR : "#3a6df0"} transparent opacity={0.85} side={2} />
      </mesh>
      <Label3D text={label} position={[x0 + 0.15, y1 + BAR / 2, z + 0.01]} height={BAR * 0.55} color="#ffffff" anchor="left" bold />
    </group>
  );
}
