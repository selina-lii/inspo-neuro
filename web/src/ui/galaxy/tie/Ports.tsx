// Cable ports on every board, network, CCG grid and pair node: drag from one to a port of another kind to cable them (board–network
// ties them; a grid takes its pairs from what it is cabled to); click a cable to select it (Delete cuts it) or right-click it.
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { BufferGeometry, Float32BufferAttribute, type Mesh, Plane, Quaternion, Vector3 } from "three";
import { patchGrid } from "../../../gridActions";
import { pick3, tie } from "../../../stackActions";
import { useStore } from "../../useStore";
import { pointer } from "../pointer";
import { claimMenu } from "../SpaceMenu";
import { ports } from "./portAt";

const HIT_PX = 30;
const UP = new Vector3(0, 1, 0);

/** Ports, the cable being dragged, and the ties' cables. */
export function TiePorts() {
  const s = useStore();
  const ids = [...s.stats.boards.filter((b) => s.stats.tests.find((t) => t.id === b.id)?.results.length).map((b) => `board:${b.id}`),
    ...(s.mainHidden ? [] : ["net:main"]), ...s.networks.map((n) => `net:${n.id}`), ...s.grids.map((g) => `grid:${g.id}`),
    ...s.pairNodes.map((n) => `node:${n.id}`), ...s.styleNodes.map((n) => `style:${n.id}`), ...s.panels.filter((p) => (p.kind === "ccg" || p.kind === "legend") && !p.closed && p.pose).map((p) => `panel:${p.id}`)];
  const { camera, size } = useThree();
  const [drag, setDrag] = useState<{ from: string; plane: Plane } | null>(null);
  const end = useRef(new Vector3());
  const line = useMemo(() => new BufferGeometry().setAttribute("position", new Float32BufferAttribute(new Float32Array(6), 3)), []);

  const screen = (v: Vector3) => {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height };
  };
  const start = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    pointer.busy = true;
    end.current.copy(ports.get(id)!);
    setDrag({ from: id, plane: new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), ports.get(id)!) });
  };
  const handlers = {
    onPointerMove(e: ThreeEvent<PointerEvent>) {
      if (drag) e.ray.intersectPlane(drag.plane, end.current);
    },
    onPointerUp(e: ThreeEvent<PointerEvent>) {
      if (!drag) return;
      e.stopPropagation();
      pointer.busy = false;
      const at = screen(end.current);
      const kind = drag.from.split(":")[0];
      const target = ids.filter((id) => id.split(":")[0] !== kind && ports.get(id))
        .map((id) => ({ id, d: Math.hypot(screen(ports.get(id)!).x - at.x, screen(ports.get(id)!).y - at.y) }))
        .sort((a, b) => a.d - b.d)[0];
      setDrag(null);
      if (!target || target.d > HIT_PX) return;
      const ends = [drag.from, target.id];
      const other = (end: string) => ends.find((x) => x !== end)!;
      const grid = ends.find((id) => id.startsWith("grid:"));
      // a CCG panel configures a grid, a legend keys it; anything else feeds it pairs
      const panel = ends.find((id) => id.startsWith("panel:"));
      const legend = panel && s.panels.find((p) => p.id === panel.slice(6))?.kind === "legend";
      if (panel) return void (grid && patchGrid(grid.slice(5), legend ? { legend: panel.slice(6) } : { config: panel.slice(6) }));
      // a style node styles a grid's curves
      const style = ends.find((id) => id.startsWith("style:"));
      if (style) return void (grid && patchGrid(grid.slice(5), { style: style.slice(6) }));
      if (grid) return patchGrid(grid.slice(5), { source: other(grid) });
      if (ends.some((id) => id.startsWith("node:"))) return;
      const [board, net] = kind === "board" ? [drag.from, target.id] : [target.id, drag.from];
      tie(board.slice(6), net.slice(4));
    },
  };
  useFrame(() => {
    if (!drag) return;
    const a = line.getAttribute("position") as Float32BufferAttribute;
    a.setXYZ(0, ...(ports.get(drag.from)!.toArray() as [number, number, number]));
    a.setXYZ(1, ...(end.current.toArray() as [number, number, number]));
    a.needsUpdate = true;
  });

  return (
    <>
      {ids.map((id) => <Port key={id} id={id} lit={drag?.from === id} {...handlers} onPointerDown={start(id)} />)}
      {drag && <lineSegments geometry={line}><lineBasicMaterial color="#ff1dce" /></lineSegments>}
      {/* a cable shows while both its ends do */}
      {s.ties.filter((t) => ids.includes(`net:${t.network}`) && ids.includes(`board:${t.board}`)).map((t) => (
        <Cable key={t.board} a={`board:${t.board}`} b={`net:${t.network}`} picked={s.picked3?.kind === "tie" && s.picked3.id === t.board}
          onPick={() => pick3("tie", t.board)} onMenu={() => claimMenu({ kind: "tie", id: t.board })} />
      ))}
      {s.grids.filter((g) => g.source && ids.includes(g.source)).map((g) => (
        <Cable key={g.id} a={`grid:${g.id}`} b={g.source!} picked={s.picked3?.kind === "grid" && s.picked3.id === g.id}
          onPick={() => pick3("grid", g.id)} onMenu={() => claimMenu({ kind: "grid", id: g.id })} />
      ))}
      {s.grids.filter((g) => g.config && ids.includes(`panel:${g.config}`)).map((g) => (
        <Cable key={`cfg${g.id}`} a={`grid:${g.id}`} b={`panel:${g.config}`} picked={false} onPick={() => undefined} onMenu={() => claimMenu({ kind: "grid", id: g.id })} />
      ))}
      {s.grids.filter((g) => g.style && ids.includes(`style:${g.style}`)).map((g) => (
        <Cable key={`sty${g.id}`} a={`grid:${g.id}`} b={`style:${g.style}`} picked={false} onPick={() => undefined} onMenu={() => claimMenu({ kind: "grid", id: g.id })} />
      ))}
      {s.grids.filter((g) => g.legend && ids.includes(`panel:${g.legend}`)).map((g) => (
        <Cable key={`key${g.id}`} a={`grid:${g.id}`} b={`panel:${g.legend}`} picked={false} onPick={() => undefined} onMenu={() => claimMenu({ kind: "grid", id: g.id })} />
      ))}
    </>
  );
}

/** A port: drag from it to a port of another kind. */
function Port({ id, lit, ...handlers }: { id: string; lit: boolean } & Record<string, unknown>) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    const at = ports.get(id);
    if (mesh.current && at) mesh.current.position.copy(at);
  });
  return (
    <mesh ref={mesh} {...handlers}>
      <sphereGeometry args={[0.18, 16, 12]} />
      <meshBasicMaterial color={lit ? "#ff1dce" : "#3a6df0"} />
    </mesh>
  );
}

/** A cable: a thin tube between two ports, kept between them each frame. */
function Cable({ a: from, b: to, picked, onPick, onMenu }: { a: string; b: string; picked: boolean; onPick(): void; onMenu(): void }) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    const [a, b] = [ports.get(from), ports.get(to)];
    const m = mesh.current;
    if (!m || !a || !b) return;
    const d = b.clone().sub(a);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.copy(new Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
    m.scale.set(1, d.length(), 1);
  });
  return (
    <mesh ref={mesh} onContextMenu={onMenu} onClick={(e) => e.delta <= 4 && (e.stopPropagation(), onPick())}>
      <cylinderGeometry args={[picked ? 0.12 : 0.07, picked ? 0.12 : 0.07, 1, 8]} />
      <meshBasicMaterial color="#ff1dce" transparent opacity={picked ? 1 : 0.75} />
    </mesh>
  );
}
