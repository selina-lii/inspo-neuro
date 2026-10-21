// A picked object's corner ticks: drag one to resize the object about its centre.
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { BufferGeometry, Float32BufferAttribute, Plane, Vector3, type Group } from "three";
import { pointer } from "../pointer";

const TICK = 0.35;

export function Corners({ group, box, size, onResize }: { group: RefObject<Group | null>; box: [number, number, number, number]; size: number; onResize(s: number): void }) {
  const camera = useThree((t) => t.camera);
  const drag = useRef<{ plane: Plane; center: Vector3; r0: number; s0: number } | null>(null);
  const [x0, y0, x1, y1] = box;
  const corners: [number, number, number, number][] = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]];
  const ticks = useMemo(() => new BufferGeometry().setAttribute("position", new Float32BufferAttribute(corners.flatMap(([x, y, dx, dy]) => [
    x, y, 0.01, x + dx * TICK, y, 0.01, x, y, 0.01, x, y + dy * TICK, 0.01,
  ]), 3)), [x0, y0, x1, y1]);
  const handlers = {
    onPointerDown(e: ThreeEvent<PointerEvent>) {
      if (e.button !== 0) return;
      e.stopPropagation();
      (e.target as unknown as Element).setPointerCapture(e.pointerId);
      const center = group.current!.localToWorld(new Vector3((x0 + x1) / 2, (y0 + y1) / 2, 0));
      const plane = new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), center);
      const hit = e.ray.intersectPlane(plane, new Vector3()) ?? center;
      drag.current = { plane, center, r0: Math.max(hit.distanceTo(center), 1e-3), s0: size };
      pointer.busy = true;
    },
    onPointerMove(e: ThreeEvent<PointerEvent>) {
      const d = drag.current;
      if (!d) return;
      e.stopPropagation();
      const hit = e.ray.intersectPlane(d.plane, new Vector3());
      if (hit) onResize(Math.min(6, Math.max(0.2, (d.s0 * hit.distanceTo(d.center)) / d.r0)));
    },
    onPointerUp(e: ThreeEvent<PointerEvent>) {
      if (!drag.current) return;
      e.stopPropagation();
      drag.current = null;
      pointer.busy = false;
    },
  };
  return (
    <>
      <lineSegments geometry={ticks}><lineBasicMaterial color="#ff1dce" /></lineSegments>
      {corners.map(([x, y, dx, dy], i) => (
        <mesh key={i} position={[x + (dx * TICK) / 2, y + (dy * TICK) / 2, 0.02]} {...handlers}>
          <planeGeometry args={[TICK, TICK]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}
