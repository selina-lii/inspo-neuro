// Moving a board by its title bar: drag slides it in the view plane, Alt-drag along the view depth, Shift-drag turns it.
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { Plane, Quaternion, Vector3, type Group } from "three";
import type { Quat, Vec3 } from "../../../core/stats";
import { moveBoard } from "../../../statsActions";
import { selected3 } from "../../../core/select";
import { store, type Picked3 } from "../../../core/store";
import { pointer } from "../pointer";
import { commitGroup, groupOf, previewGroup, type Group3 } from "../select3";
import { settleTies } from "../../../stackActions";

type Drag = { mode: "move" | "depth" | "turn"; x: number; y: number; p: Vector3; q: Quaternion; plane: Plane; hit: Vector3; rest: Group3 };

/** `onDone` gets the group's final position and turn; a board by default. A selected *kind* carries the rest of the selection. */
export function useBoardDrag(id: string, group: RefObject<Group | null>, onDone: (p: Vec3, q: Quat) => void = (p, q) => moveBoard(id, { p, q }), kind: Picked3["kind"] | null = "board") {
  // how far the group has moved and turned since the press
  const moved = (d: Drag, g: Group) => [g.position.clone().sub(d.p), g.quaternion.clone().multiply(d.q.clone().invert())] as const;
  const camera = useThree((t) => t.camera);
  const drag = useRef<Drag | null>(null);
  return {
    onPointerDown(e: ThreeEvent<PointerEvent>) {
      if (e.button !== 0) return;
      e.stopPropagation();
      (e.target as unknown as Element).setPointerCapture(e.pointerId);
      const g = group.current!;
      const plane = new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), g.position);
      const hit = e.ray.intersectPlane(plane, new Vector3()) ?? g.position.clone();
      const rest = kind ? groupOf({ kind, id }, g.position.clone(), selected3(store.get(), kind, id)) : [];
      // grabbed while its stack still places it: the hand wins
      if (kind === "board") settleTies(id);
      drag.current = { mode: e.shiftKey ? "turn" : e.altKey ? "depth" : "move", x: e.clientX, y: e.clientY, p: g.position.clone(), q: g.quaternion.clone(), plane, hit, rest };
      pointer.busy = true;
    },
    onPointerMove(e: ThreeEvent<PointerEvent>) {
      const d = drag.current;
      if (!d) return;
      e.stopPropagation();
      const g = group.current!;
      const [dx, dy] = [e.clientX - d.x, e.clientY - d.y];
      if (d.mode === "move") {
        const now = e.ray.intersectPlane(d.plane, new Vector3());
        if (now) g.position.copy(d.p).add(now.sub(d.hit));
      } else if (d.mode === "depth") {
        g.position.copy(d.p).addScaledVector(camera.getWorldDirection(new Vector3()), -dy * camera.position.distanceTo(d.p) * 0.004);
      } else {
        const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const turn = new Quaternion().setFromAxisAngle(up, dx * 0.01).multiply(new Quaternion().setFromAxisAngle(right, dy * 0.01));
        g.quaternion.copy(turn.multiply(d.q));
      }
      previewGroup(d.rest, ...moved(d, g));
    },
    onPointerUp(e: ThreeEvent<PointerEvent>) {
      const d = drag.current;
      if (!d) return;
      e.stopPropagation();
      drag.current = null;
      pointer.busy = false;
      const g = group.current!;
      commitGroup(d.rest, ...moved(d, g));
      onDone(g.position.toArray() as Vec3, g.quaternion.toArray() as Quat);
    },
  };
}
