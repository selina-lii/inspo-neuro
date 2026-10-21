// A link's path in 3D: a quadratic curve bowed to one side, so A→B and B→A part.
import { Vector3 } from "three";

export const SEGMENTS = 10;   // straight pieces per curved link

export function curve(a: Vector3, b: Vector3): Vector3[] {
  const dir = b.clone().sub(a);
  const len = dir.length() || 1;
  const side = new Vector3().crossVectors(dir, Math.abs(dir.z) > 0.9 * len ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1)).normalize();
  const c = a.clone().add(b).multiplyScalar(0.5).addScaledVector(side, len * 0.2);   // one side per direction: A→B and B→A part
  const out: Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const u = 1 - t;
    out.push(new Vector3(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z));
  }
  return out;
}
