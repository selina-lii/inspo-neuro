// Whether a card is big on screen: up close it is redrawn with thin lines at a finer resolution.
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useState, type RefObject } from "react";
import { PerspectiveCamera, Vector3, type Object3D } from "three";

const NEAR_PX = 520;
const FAR_PX = 400;   // below the switch-up width, so a card at the edge does not flicker between the two
const at = new Vector3();
const scale = new Vector3();

export function useNear(object: RefObject<Object3D | null>, width: number): boolean {
  const [near, setNear] = useState(false);
  const now = useRef(near);
  const { camera, size } = useThree();
  useFrame(() => {
    const o = object.current;
    if (!o) return;
    o.getWorldPosition(at);
    o.getWorldScale(scale);
    const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180;
    const px = ((width * scale.x) / (2 * Math.tan(fov / 2) * at.distanceTo(camera.position))) * size.height;
    const want = now.current ? px > FAR_PX : px > NEAR_PX;
    if (want !== now.current) setNear((now.current = want));
  });
  return near;
}
