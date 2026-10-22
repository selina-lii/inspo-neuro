// Cable ports on every object, and a cable per wire: a drag from one port to another wires them as their ends allow
// (core/wires); a click selects a cable (Delete cuts it), a right-click opens its object's menu.
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { BufferGeometry, Float32BufferAttribute, type Group, type Mesh, Plane, Quaternion, Vector3 } from "three";
import { connect } from "../../../wireActions";
import { idOf, wiresOf } from "../../../core/wires";
import { selected3 } from "../../../core/select";
import type { Picked3 } from "../../../core/store";
import { useStore } from "../../useStore";
import { begin } from "../gesture";
import { claimMenu, type Target } from "../SpaceMenu";
import { ports } from "./portAt";

const HIT_PX = 30;
const UP = new Vector3(0, 1, 0);
const GRAB = 0.012;   // the cable's grab radius per unit of camera distance

/** Ports, the cable being dragged, and the ties' cables. */
export function TiePorts() {
  const s = useStore();
  const ids = [...s.stats.boards.filter((b) => s.stats.tests.find((t) => t.id === b.id)?.results.length).map((b) => `board:${b.id}`),
    ...(s.mainHidden ? [] : ["net:main"]), ...s.networks.map((n) => `net:${n.id}`), ...s.grids.map((g) => `grid:${g.id}`),
    ...s.pairNodes.map((n) => `node:${n.id}`), ...s.styleNodes.map((n) => `style:${n.id}`), ...s.panels.filter((p) => (p.kind === "ccg" || p.kind === "legend" || p.kind === "stats") && !p.closed && p.pose).map((p) => `panel:${p.id}`)];
  const { camera, size } = useThree();
  const [drag, setDrag] = useState<string | null>(null);
  const end = useRef(new Vector3());
  const live = useRef(ids);
  live.current = ids;
  const line = useMemo(() => new BufferGeometry().setAttribute("position", new Float32BufferAttribute(new Float32Array(6), 3)), []);

  const screen = (v: Vector3) => {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height };
  };
  // a drag from a port draws a cable to the pointer; released near another kind's port, it wires the two
  const start = (from: string) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const plane = new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), ports.get(from)!);
    end.current.copy(ports.get(from)!);
    setDrag(from);
    begin({
      move: (r) => void r.ray.intersectPlane(plane, end.current),
      end() {
        setDrag(null);
        const at = screen(end.current);
        const kind = from.split(":")[0];
        const target = live.current.filter((id) => id.split(":")[0] !== kind && ports.get(id))
          .map((id) => ({ id, d: Math.hypot(screen(ports.get(id)!).x - at.x, screen(ports.get(id)!).y - at.y) }))
          .sort((a, b) => a.d - b.d)[0];
        if (target && target.d <= HIT_PX) connect(from, target.id);
      },
    });
  };
  useFrame(() => {
    if (!drag) return;
    const a = line.getAttribute("position") as Float32BufferAttribute;
    a.setXYZ(0, ...(ports.get(drag)!.toArray() as [number, number, number]));
    a.setXYZ(1, ...(end.current.toArray() as [number, number, number]));
    a.needsUpdate = true;
  });

  return (
    <>
      {ids.map((id) => <Port key={id} id={id} lit={drag === id} onPointerDown={start(id)} />)}
      {drag && <lineSegments geometry={line}><lineBasicMaterial color="#ff1dce" /></lineSegments>}
      {/* a cable shows while both its ends do */}
      {s.cables && wiresOf(s).filter((w) => ids.includes(w.from) && ids.includes(w.to)).map((w) => {
        const id = `${w.from}>${w.to}`;
        const pick: Picked3 | undefined = w.role === "tie" ? { kind: "tie", id: idOf(w.from) } : w.role === "edit" ? undefined : { kind: "cable", id };
        const grid = [w.from, w.to].find((p) => p.startsWith("grid:"));
        const menu: Target = w.role === "tie" ? { kind: "tie", id: idOf(w.from) } : grid ? { kind: "grid", id: idOf(grid) } : { kind: "panel", id: idOf(w.from) };
        return <Cable key={id} a={w.from} b={w.to} picked={pick ? selected3(s, pick.kind, pick.id) : false} pick={pick} onMenu={() => claimMenu(menu)} />;
      })}
    </>
  );
}

/** A port: drag from it to a port of another kind. */
function Port({ id, lit, ...handlers }: { id: string; lit: boolean } & Record<string, unknown>) {
  const group = useRef<Group>(null);
  const grab = useRef<Mesh>(null);
  const camera = useThree((t) => t.camera);
  useFrame(() => {
    const at = ports.get(id);
    if (!group.current || !at) return;
    group.current.position.copy(at);
    // an unseen ball as wide on screen at any distance: the dot is grabbed from a little way off
    grab.current!.scale.setScalar(Math.max(0.3, camera.position.distanceTo(at) * GRAB * 1.5));
  });
  return (
    <group ref={group} {...handlers}>
      <mesh>
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshBasicMaterial color={lit ? "#ff1dce" : "#3a6df0"} />
      </mesh>
      <mesh ref={grab}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

/** A cable: a thin tube between two ports, kept between them each frame. */
/** A cable; *pick* makes it selectable like any object, by a click on it (with Shift or ⌘ joining the selection). */
function Cable({ a: from, b: to, picked, pick, onMenu }: { a: string; b: string; picked: boolean; pick?: Picked3; onMenu(): void }) {
  const group = useRef<Group>(null);
  const tube = useRef<Mesh>(null);
  const arrow = useRef<Mesh>(null);
  const sleeve = useRef<Mesh>(null);
  const camera = useThree((t) => t.camera);
  useFrame(() => {
    const [a, b] = [ports.get(from), ports.get(to)];
    const g = group.current;
    if (!g || !a || !b) return;
    const d = b.clone().sub(a);
    g.position.copy(a).addScaledVector(d, 0.5);
    g.quaternion.copy(new Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
    tube.current!.scale.set(1, d.length(), 1);
    // an unseen sleeve as wide on screen at any distance, so a thin cable is still easy to grab
    const r = Math.max(0.15, camera.position.distanceTo(g.position) * GRAB);
    sleeve.current!.scale.set(r, d.length(), r);
    // the arrow at the middle points the way the data goes, as large on screen at any distance
    arrow.current!.scale.setScalar(Math.min(Math.max(0.2, r * 1.6), d.length() / 3));
  });
  return (
    <group ref={group} onContextMenu={onMenu} userData={pick ? { pick } : {}}>
      <mesh ref={tube}>
        <cylinderGeometry args={[picked ? 0.12 : 0.07, picked ? 0.12 : 0.07, 1, 8]} />
        <meshBasicMaterial color="#ff1dce" transparent opacity={picked ? 1 : 0.75} />
      </mesh>
      <mesh ref={arrow}>
        <coneGeometry args={[0.5, 1, 16]} />
        <meshBasicMaterial color="#ff1dce" />
      </mesh>
      <mesh ref={sleeve}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}
