// CCG cards in the 3D space: one small billboard per pair beside its link (the focused one, the selection, or every shown
// link), drawn into a canvas texture so a large group stays cheap. Click a card to focus its pair and get its corner
// ticks; double-click opens the extended view, the CCG panel with its controls, beside it.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type CanvasTexture, type Group, Vector3 } from "three";
import { focusPair, openPanelAt } from "../../actions";
import { paletteColor, TYPE_COLORS } from "../../core/colors";
import { normalize, segmentHours } from "../../core/norms";
import type { Quat, Vec3 } from "../../core/stats";
import { activeSegment, store, type CcgOptions } from "../../core/store";
import { linkKey, type Link, type Point3, type Trace } from "../../core/types";
import { acgOf, tracesKey, traceOf } from "../../io/traces";
import { useStore } from "../useStore";
import { ccgTexture } from "./ccgTexture";
import { curve, SEGMENTS } from "./curve";
import { PANEL_PX } from "./Panels3D";
import { Corners } from "./stats/BoardCorners";
import { useNear } from "./useNear";

const SIZE = { w: 2.4, h: 1.4 };   // 3D units at objectScale 1

/** What the CCG panel's options make of a card: its baseline in the segment's colour, the ACGs when they are held. */
export type CardLook = { options: CcgOptions; base: string; acgs?: { ref: number[] | null; tgt: number[] | null }; width?: number; alpha?: number };

/** One CCG card: the CCG panel's plot of it. */
export const drawCcg = (trace: Trace, title: string, color: string, focused: boolean, look: CardLook, near = 0): CanvasTexture =>
  ccgTexture({ curves: [{ trace, color, base: look.base, width: look.width, alpha: look.alpha }], fitScale: null, options: look.options, acgs: look.acgs, title }, focused, near);


function Card({ link, at, side, focused, dark, scale }: { link: Link; at: Vector3; side: Vector3; focused: boolean; dark: boolean; scale: number }) {
  const s = useStore();
  const group = useRef<Group>(null);
  const camera = useThree((t) => t.camera);
  const segment = activeSegment(s);
  const held = Boolean(s.session && s.traces === tracesKey(s.session, segment));
  const [a, b] = [s.neurons[link.ref], s.neurons[link.tgt]];
  const near = useNear(group, SIZE.w * scale);
  const texture = useMemo(() => {
    const raw = held ? traceOf(s.session!, segment, link.ref, link.tgt, s.ccg.res) : null;
    if (!raw) return null;
    const trace = normalize(raw, s.ccg.norms, { refRate: a?.rate ?? 1, tgtRate: b?.rate ?? 1, hours: segmentHours(s, segment) }).trace;
    const acgs = { ref: acgOf(s.session!, segment, link.ref, s.ccg.res), tgt: acgOf(s.session!, segment, link.tgt, s.ccg.res) };
    return drawCcg(trace, `#${a?.id} → #${b?.id}`, TYPE_COLORS[link.type] ?? "#888", focused, { options: s.ccg, base: paletteColor(segment), acgs }, near);
  }, [held, s.session, segment, link, s.ccg, focused, dark, a, b, near]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const [w, h] = [SIZE.w * scale, SIZE.h * scale];
  const pos = useMemo(() => at.clone().addScaledVector(side, (h * 0.5 + 0.3) * (focused ? 1.6 : 1)), [at, side, h, focused]);
  useFrame(() => group.current?.quaternion.copy(camera.quaternion));   // a billboard: always faces the viewer
  const extend = () => {
    const s = store.get();
    const panel = s.panels.find((p) => p.id === "ccg")!;
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const at = pos.clone().addScaledVector(right, w / 2 + (panel.w * PANEL_PX * s.objectScale) / 2 + 0.3);
    openPanelAt("ccg", { ...panel.pose, p: at.toArray() as Vec3, q: camera.quaternion.toArray() as Quat });
  };
  if (!texture) return null;
  return (
    <>
      <group ref={group} position={pos} renderOrder={focused ? 3 : 2}>
        <mesh onClick={(e) => e.delta <= 4 && (e.stopPropagation(), focusPair(link.ref, link.tgt))}
          onDoubleClick={(e) => (e.stopPropagation(), extend())}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={texture} transparent />
        </mesh>
        {focused && <Corners group={group} box={[-w / 2, -h / 2, w / 2, h / 2]} size={s.cardScale} onResize={(k) => store.set({ cardScale: k })} />}
      </group>
    </>
  );
}

/** Every pair that carries a card under the "CCG cards" setting, each beside the middle of its link. */
export function CcgCards({ links, pts, dark }: { links: Link[]; pts: Point3[]; dark: boolean }) {
  const s = useStore();
  const focusKey = s.focus?.kind === "pair" ? linkKey(s.focus.ref, s.focus.tgt) : null;
  const want = (l: Link) => {
    const key = linkKey(l.ref, l.tgt);
    return key === focusKey || (s.thumbs !== "focused" && (s.thumbs === "shown" || s.selection.links.has(key)));
  };
  const cards = links.filter(want).flatMap((l) => {
    const [a, b] = [pts[l.ref], pts[l.tgt]];
    if (!a || !b) return [];
    const line = curve(new Vector3(a.x, a.y, a.z), new Vector3(b.x, b.y, b.z));
    const mid = line[SEGMENTS / 2]!;
    // the card sits off the bow of its curve, away from the straight line between the neurons
    const side = mid.clone().sub(line[0]!.clone().add(line[SEGMENTS]!).multiplyScalar(0.5)).normalize();
    return [{ link: l, at: mid, side: side.lengthSq() ? side : new Vector3(0, 1, 0) }];
  });
  return <>{cards.map((c) => <Card key={linkKey(c.link.ref, c.link.tgt)} {...c} focused={linkKey(c.link.ref, c.link.tgt) === focusKey} dark={dark} scale={s.objectScale * s.cardScale} />)}</>;
}
