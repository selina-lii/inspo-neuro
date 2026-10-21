// Every tie in the scene: its network's session stack and the overlay cards on it, plus the cable ports.
import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import { Vector3 } from "three";
import type { Tie } from "../../../core/stack";
import type { Vec3 } from "../../../core/stats";
import type { Point3 } from "../../../core/types";
import { arranged } from "../../../stackActions";
import { useStore } from "../../useStore";
import type { Probe } from "../layout3";
import type { SceneBox } from "../Panels3D";
import { OverlayCards } from "./OverlayCards";
import { ports } from "./portAt";
import { TiePorts } from "./Ports";
import { anchorOf, arrangeTie, StackLayers, useLayers } from "./Stack";

type Scene = { pts: Point3[]; probes: Probe[]; box: SceneBox; center: Vec3; dark: boolean };

export function TiedStacks(scene: Scene) {
  const { ties, mainAt } = useStore();
  const { box } = scene;
  // the main network's port: above its right edge
  useFrame(() => void ports.set("net:main", new Vector3(box.x1 + 0.6, box.y1, box.z).add(new Vector3(...mainAt))));
  return (
    <>
      <TiePorts />
      {ties.map((t) => <TiedStack key={t.board} tie={t} {...scene} />)}
    </>
  );
}

function TiedStack({ tie, pts, probes, box, center, dark }: Scene & { tie: Tie }) {
  const s = useStore();
  const layers = useLayers(tie, pts, probes);
  // a new tie stands its board on the stack's side wall, placed again as layers arrive so it clears all of them
  const loaded = layers.filter((l) => l.data || l.session === s.session).length;
  useEffect(() => {
    if (!tie.fresh) return;
    const timer = window.setTimeout(() => {
      arrangeTie(tie, box, center, layers);
      if (loaded === layers.length) arranged(tie.board);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [tie.fresh, layers.length, loaded]);
  return (
    <>
      <StackLayers tie={tie} layers={layers} center={center} dark={dark} />
      <OverlayCards tie={tie} layers={layers} anchor={anchorOf(s, tie.network, center)} dark={dark} />
    </>
  );
}
