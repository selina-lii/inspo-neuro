// How big a card is on screen: up close it is redrawn at the pixels it covers, as the CCG panel draws it.
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useState, type RefObject } from "react";
import { PerspectiveCamera, Vector3, type Object3D } from "three";
import { W } from "../panel/CcgPlot";

const NEAR_PX = 520;
const FAR_PX = 400;   // below the switch-up width, so a card at the edge does not flicker between the two
const MAX_SCALE = 12;
const at = new Vector3();
const scale = new Vector3();

/** 0 while the card is small on screen; else the texture scale that matches its screen pixels. */
export function useNear(object: RefObject<Object3D | null>, width: number): number {
  const [near, setNear] = useState(0);
  const now = useRef(near);
  const { camera, size, gl } = useThree();
  useFrame(() => {
    const o = object.current;
    if (!o) return;
    o.getWorldPosition(at);
    o.getWorldScale(scale);
    const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180;
    const px = ((width * scale.x) / (2 * Math.tan(fov / 2) * at.distanceTo(camera.position))) * size.height;
    const on = now.current ? px > FAR_PX : px > NEAR_PX;
    // whole steps of the plot's own width, so zooming redraws a card only now and then
    const want = on ? Math.min(MAX_SCALE, Math.ceil((px * gl.getPixelRatio()) / W)) : 0;
    if (want !== now.current) setNear((now.current = want));
  });
  return near;
}
