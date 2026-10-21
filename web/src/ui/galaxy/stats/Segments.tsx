// Straight line pieces in a board's plane, `width` in screen pixels.
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

/** `points`: x0, y0, x1, y1 per piece at depth `z`; with `dim` 3, x0, y0, z0, x1, y1, z1 per piece. */
export function Segments({ points, color, width = 1, opacity = 1, z = 0, dim = 2 }: { points: number[]; color: string; width?: number; opacity?: number; z?: number; dim?: 2 | 3 }) {
  const size = useThree((t) => t.size);
  const object = useMemo(() => {
    const xyz: number[] = dim === 3 ? points : [];
    if (dim === 2) for (let i = 0; i + 3 < points.length; i += 4) xyz.push(points[i]!, points[i + 1]!, z, points[i + 2]!, points[i + 3]!, z);
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(xyz);
    const line = new LineSegments2(geometry, new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, depthWrite: opacity === 1 }));
    line.raycast = () => undefined;
    return line;
  }, [points, color, width, opacity, z, dim]);
  useEffect(() => {
    (object.material as LineMaterial).resolution.set(size.width, size.height);
  }, [object, size]);
  useEffect(() => () => {
    object.geometry.dispose();
    (object.material as LineMaterial).dispose();
  }, [object]);
  return points.length >= 4 ? <primitive object={object} /> : null;
}
