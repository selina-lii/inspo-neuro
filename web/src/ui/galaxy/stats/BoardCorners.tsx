// A picked object's corner ticks: drag one to resize the object about its centre.
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo, type RefObject } from "react";
import { BufferGeometry, Float32BufferAttribute, Plane, Vector3, type Group } from "three";
import { begin } from "../gesture";

const TICK = 0.35;

export function Corners({ group, box, size, onResize }: { group: RefObject<Group | null>; box: [number, number, number, number]; size: number; onResize(s: number): void }) {
  const camera = useThree((t) => t.camera);
  const [x0, y0, x1, y1] = box;
  const corners: [number, number, number, number][] = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]];
  const ticks = useMemo(() => new BufferGeometry().setAttribute("position", new Float32BufferAttribute(corners.flatMap(([x, y, dx, dy]) => [
    x, y, 0.01, x + dx * TICK, y, 0.01, x, y, 0.01, x, y + dy * TICK, 0.01,
  ]), 3)), [x0, y0, x1, y1]);
  const press = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const center = group.current!.localToWorld(new Vector3((x0 + x1) / 2, (y0 + y1) / 2, 0));
    const plane = new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), center);
    const r0 = Math.max((e.ray.intersectPlane(plane, new Vector3()) ?? center).distanceTo(center), 1e-3);
    begin({
      move(r) {
        const hit = r.ray.intersectPlane(plane, new Vector3());
        if (hit) onResize(Math.min(6, Math.max(0.2, (size * hit.distanceTo(center)) / r0)));
      },
      end() {},
    });
  };
  return (
    <>
      <lineSegments geometry={ticks}><lineBasicMaterial color="#ff1dce" /></lineSegments>
      {corners.map(([x, y, dx, dy], i) => (
        <mesh key={i} position={[x + (dx * TICK) / 2, y + (dy * TICK) / 2, 0.02]} onPointerDown={press}>
          <planeGeometry args={[TICK, TICK]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}
