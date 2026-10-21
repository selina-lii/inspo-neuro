// A board's values as dots: click picks one value, double-click its pair's whole lineage. A picked pair counts as paired:
// its line across rows is drawn half-bright on a click, bright on a double-click; pair lines are off, all faint, or picked only.
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Color, InstancedMesh, Object3D, SphereGeometry } from "three";
import type { PairLines, StatsPick, StatsValue } from "../../../core/stats";
import { hoverValue, pickValue } from "../../../statsActions";
import type { BoardLayout } from "./boardGeometry";
import { Segments } from "./Segments";

const PICKED = "#ffb000";
const OUTLIER = "#cc0000";
const LINE_GREY = "#7a7f88";
const HIDDEN = "#b4b8bf";

type Props = { board: string; layout: BoardLayout; values: Record<string, StatsValue>; grayed: Set<string>; pick: StatsPick; res: string; fg: string; mode: PairLines };

export function BoardDots({ board, layout, values, grayed, pick, res, fg, mode }: Props) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new SphereGeometry(0.045, 10, 8), []);   // balls, like the bodies, read from any angle
  const [hover, setHover] = useState<number | null>(null);
  const { dots, pairLines } = layout;
  useEffect(() => () => geometry.dispose(), [geometry]);
  const lit = dots.filter((d) => pick.ids.has(d.id));

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new Object3D();
    const color = new Color();
    dots.forEach((d, i) => {
      dummy.position.set(d.x, d.y, d.z);
      dummy.scale.setScalar(i === hover ? 1.5 : 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, color.set(grayed.has(d.id) ? HIDDEN : d.outlier ? OUTLIER : fg));
    });
    m.count = dots.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [dots, pick, hover, fg, grayed]);

  const lines = useMemo(() => {
    const faint: number[] = [];
    const bright: number[] = [];
    for (const [a, b] of pairLines) {
      const [p, q] = [dots[a]!, dots[b]!];
      if (values[p.id]?.pair === pick.pair) bright.push(p.x, p.y, p.z, q.x, q.y, q.z);
      else if (mode === "faint" && !grayed.has(p.id)) faint.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
    return { faint, bright };
  }, [pairLines, dots, pick, values, mode, grayed]);

  const idAt = (e: ThreeEvent<MouseEvent | PointerEvent>) => (e.instanceId === undefined ? null : dots[e.instanceId]?.id ?? null);

  return (
    <group>
      {mode !== "off" && (
        <>
          <Segments points={lines.faint} color={fg} opacity={lit.length ? 0.03 : 0.12} dim={3} />
          <Segments points={lines.bright} color={LINE_GREY} width={pick.lineage ? 3 : 2} opacity={pick.lineage ? 1 : 0.6} dim={3} />
        </>
      )}
      <instancedMesh ref={mesh} args={[geometry, undefined, Math.max(dots.length, 1)]}
        onPointerMove={(e) => {
          e.stopPropagation();
          const i = e.instanceId ?? null;
          if (i === hover) return;
          setHover(i);
          hoverValue(i === null ? null : { id: dots[i]!.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
        }}
        onPointerOut={() => (setHover(null), hoverValue(null))}
        onClick={(e) => {
          const id = idAt(e);
          if (e.delta > 4 || !id) return;
          e.stopPropagation();
          pickValue(id, false, board);
        }}
        onDoubleClick={(e) => {
          const id = idAt(e);
          if (!id) return;
          e.stopPropagation();
          pickValue(id, true, board);
        }}>
        <meshBasicMaterial transparent opacity={lit.length ? 0.08 : 0.45} depthWrite={false} />
      </instancedMesh>
      {/* the picked values stay solid while the rest of the board drops back */}
      {lit.map((d) => (
        <mesh key={d.id} geometry={geometry} position={[d.x, d.y, d.z]} scale={1.9} raycast={() => null}>
          <meshBasicMaterial color={PICKED} />
        </mesh>
      ))}
    </group>
  );
}
