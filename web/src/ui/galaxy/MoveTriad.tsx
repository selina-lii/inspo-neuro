// The selected object's transform gizmo, on the object's own axes: press an arrow and drag to move along it, a square to
// move in its plane, a ring to turn about its axis. The move is relative to where the handle was grabbed.
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useRef, useState } from "react";
import { type Group, type Intersection, Mesh, Plane, Quaternion, type Raycaster, Vector3 } from "three";
import { useStore } from "../useStore";
import { begin } from "./gesture";
import { commit, commitGroup, groupOf, movable, placeOf, preview, previewGroup, startOf, TRIAD, transformed } from "./select3";

const AXES = [
  { name: "x", dir: new Vector3(1, 0, 0), color: "#e05555" },
  { name: "y", dir: new Vector3(0, 1, 0), color: "#3fbf6b" },
  { name: "z", dir: new Vector3(0, 0, 1), color: "#3a6df0" },
] as const;
// each square lies in the plane of two axes, coloured by the third (its normal)
const PLANES = [
  { name: "xy", a: 0, b: 1, normal: 2 },
  { name: "yz", a: 1, b: 2, normal: 0 },
  { name: "xz", a: 0, b: 2, normal: 1 },
] as const;
const SCREEN = 0.09;   // gizmo length per unit of camera distance: the same size on screen at any zoom
const LIT = "#ffd400";
const NO_TURN = new Quaternion();

// the gizmo sits inside its object: its hits count as nearest, so the object never takes the press
function first(this: Mesh, raycaster: Raycaster, hits: Intersection[]): void {
  const n = hits.length;
  Mesh.prototype.raycast.call(this, raycaster, hits);
  for (let i = n; i < hits.length; i++) hits[i]!.distance = 0;
}

type Handle = { move: number } | { plane: number } | { ring: number };

const nameOf = (h: Handle) => ("move" in h ? AXES[h.move]!.name : "plane" in h ? PLANES[h.plane]!.name : `r${AXES[h.ring]!.name}`);

export function MoveTriad() {
  const { picked3: picked, gizmo } = useStore();
  const camera = useThree((t) => t.camera);
  const group = useRef<Group>(null);
  const held = useRef(false);
  const [lit, setLit] = useState<string | null>(null);

  useFrame(() => {
    const g = group.current;
    if (!g || !picked || held.current) return;
    const place = placeOf(picked);
    g.visible = Boolean(place);
    if (!place) return;
    g.position.copy(place.at);
    g.quaternion.copy(place.q);
    // within a third of the object, so its corner handles stay clear of the gizmo
    g.scale.setScalar(Math.min(camera.position.distanceTo(g.position) * SCREEN, place.size * 0.33));
  });

  if (!picked || !gizmo || !movable(picked)) return null;
  const turns = picked.kind !== "network";

  const start = (handle: Handle) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const from = placeOf(picked);
    if (!from) return;
    e.stopPropagation();
    const local = (i: number) => AXES[i]!.dir.clone().applyQuaternion(from.q);
    const view = camera.getWorldDirection(new Vector3());
    // an arrow drags on the plane through it that faces the camera most; a square on its own plane; a ring on its disc
    const axis = "move" in handle ? local(handle.move) : "plane" in handle ? local(PLANES[handle.plane]!.normal) : local(handle.ring);
    const normal = "move" in handle ? new Vector3().crossVectors(axis, new Vector3().crossVectors(view, axis)).normalize() : axis;
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, from.at);
    const grab = e.ray.intersectPlane(plane, new Vector3()) ?? from.at.clone();
    const [startPose, members] = [startOf(picked), groupOf(picked, from.pivot)];
    let [shift, turn, moved] = [new Vector3(), NO_TURN, false];
    held.current = true;
    setLit(nameOf(handle));
    begin({
      move(r) {
        const hit = r.ray.intersectPlane(plane, new Vector3());
        if (!hit) return;
        if ("ring" in handle) {
          const [a, b] = [grab.clone().sub(from.at), hit.clone().sub(from.at)];
          turn = new Quaternion().setFromAxisAngle(axis, Math.atan2(axis.dot(new Vector3().crossVectors(a, b)), a.dot(b)));
        } else {
          shift = hit.sub(grab);
          if ("move" in handle) shift = axis.clone().multiplyScalar(shift.dot(axis));
        }
        moved = true;
        group.current!.position.copy(from.at).add(shift);
        group.current!.quaternion.copy(turn).multiply(from.q);
        preview(picked, from, startPose, shift, turn);
        previewGroup(members, shift, turn);
      },
      end() {
        held.current = false;
        setLit(null);
        if (!moved) return;
        commit(picked, transformed(from, shift, turn));
        commitGroup(members, shift, turn);
      },
    });
  };
  const handlers = (handle: Handle) => ({
    onPointerDown: start(handle),
    onClick: (e: ThreeEvent<MouseEvent>) => e.stopPropagation(),
    onDoubleClick: (e: ThreeEvent<MouseEvent>) => e.stopPropagation(),
    onPointerOver: (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), held.current || setLit(nameOf(handle))),
    onPointerOut: () => held.current || setLit(null),
  });

  return (
    <group ref={group} userData={{ pick: TRIAD }}>
      {AXES.map((a, i) => {
        const on = lit === a.name;
        return (
          <group key={a.name} quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), a.dir)} {...handlers({ move: i })}>
            <mesh position={[0, 0.5, 0]} renderOrder={10} raycast={first}>
              <cylinderGeometry args={[on ? 0.035 : 0.02, on ? 0.035 : 0.02, 1, 8]} />
              <meshBasicMaterial color={on ? LIT : a.color} depthTest={false} transparent />
            </mesh>
            <mesh position={[0, 1.08, 0]} renderOrder={10} raycast={first}>
              <coneGeometry args={[0.08, 0.22, 16]} />
              <meshBasicMaterial color={on ? LIT : a.color} depthTest={false} transparent />
            </mesh>
            {/* a fatter, unseen sleeve makes the thin arrow easy to grab */}
            <mesh position={[0, 0.6, 0]} raycast={first}>
              <cylinderGeometry args={[0.12, 0.12, 1.3, 6]} />
              <meshBasicMaterial visible={false} />
            </mesh>
          </group>
        );
      })}
      {PLANES.map((p, i) => {
        const on = lit === p.name;
        return (
          <mesh key={p.name} position={AXES[p.a]!.dir.clone().add(AXES[p.b]!.dir).multiplyScalar(0.32)} renderOrder={10} raycast={first}
            quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), AXES[p.normal]!.dir)} {...handlers({ plane: i })}>
            <planeGeometry args={[0.24, 0.24]} />
            <meshBasicMaterial color={on ? LIT : AXES[p.normal]!.color} transparent opacity={on ? 0.7 : 0.35} side={2} depthTest={false} />
          </mesh>
        );
      })}
      {turns && AXES.map((a, i) => {
        const on = lit === `r${a.name}`;
        return (
          <group key={`r${a.name}`} quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), a.dir)} {...handlers({ ring: i })}>
            <mesh renderOrder={10} raycast={first}>
              <torusGeometry args={[0.78, on ? 0.022 : 0.012, 6, 64]} />
              <meshBasicMaterial color={on ? LIT : a.color} depthTest={false} transparent opacity={0.9} />
            </mesh>
            <mesh raycast={first}>
              <torusGeometry args={[0.78, 0.07, 4, 48]} />
              <meshBasicMaterial visible={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
