// Overlay CCG cards on a tied stack: one billboard per pair beside its link on its session's layer, one curve per test row
// that holds the pair (row colours, the CCG panel's norms). During playback the current row's curve is bold.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type CanvasTexture, Vector3, type Group } from "three";
import type { CcgOptions } from "../../../core/store";
import { rowsWithPair, rowTrace, type StackRow, type Tie } from "../../../core/stack";
import type { Trace } from "../../../core/types";
import { stackOf } from "../../../stackActions";
import { useStore } from "../../useStore";
import { ccgTexture } from "../ccgTexture";
import { curve, SEGMENTS } from "../curve";
import { layerShift, type DrawnLayer } from "./Stack";
import { anchors } from "./portAt";
import { useNear } from "../useNear";

const SIZE = { w: 2.6, h: 1.5 };

/** A pair's curves, one per row, on the CCG panel's plot; the playing row is bold. */
const drawOverlay = (curves: { row: StackRow; trace: Trace; width?: number; alpha?: number }[], title: string, bold: string | null, picked: boolean, options: CcgOptions, near = 0, ylim?: [number, number]): CanvasTexture =>
  ccgTexture({ curves: curves.map(({ row, trace, width, alpha }) => ({ trace, color: row.color, name: row.name, base: row.color, bold: bold === row.name, faint: bold !== null && bold !== row.name, width, alpha })), fitScale: null, options, title, ylim }, picked, near);

type CardSpec = { key: string; layer: DrawnLayer; ref: number; tgt: number; at: Vector3; side: Vector3; curves: { row: StackRow; trace: Trace }[]; picked: boolean };

export function OverlayCards({ tie, layers, anchor, dark }: { tie: Tie; layers: DrawnLayer[]; anchor: { p: [number, number, number]; s: number }; dark: boolean }) {
  const s = useStore();
  const st = stackOf(tie.board);
  const pickPair = s.stats.pick.pair;
  const bold = s.playback?.board === tie.board && st ? st.rows[s.playback.row]?.name ?? null : null;
  const cards = useMemo<CardSpec[]>(() => {
    if (!st) return [];
    const { values } = s.stats;
    const pairs = s.stackCards === "all" ? [...new Set(st.result.rows.flatMap((r) => r.ids.map((id) => values[id]?.pair).filter((p): p is string => Boolean(p))))]
      : pickPair && rowsWithPair(st.result, values, pickPair).length ? [pickPair] : [];
    return pairs.flatMap((pair) => {
      const [session, r, t] = pair.split("|");
      const [ref, tgt] = [Number(r), Number(t)];
      const layer = layers.find((l) => l.session === session);
      const [a, b] = [layer?.pts[ref], layer?.pts[tgt]];
      if (!layer?.data || !a || !b) return [];
      const curves = rowsWithPair(st.result, values, pair).flatMap((i) => {
        const trace = rowTrace(layer.data!, st.rows[i]!, ref, tgt, s.ccg.norms, st.result.resolution);
        return trace ? [{ row: st.rows[i]!, trace }] : [];
      });
      if (!curves.length) return [];
      const line = curve(new Vector3(a.x, a.y, a.z), new Vector3(b.x, b.y, b.z));
      const mid = line[SEGMENTS / 2]!;
      const side = mid.clone().sub(line[0]!.clone().add(line[SEGMENTS]!).multiplyScalar(0.5)).normalize();
      return [{ key: pair, layer, ref, tgt, at: mid, side: side.lengthSq() ? side : new Vector3(0, 1, 0), curves, picked: pair === pickPair }];
    });
  }, [st?.result, st?.rows, layers, s.stackCards, pickPair, s.stats.values, s.ccg.norms]);
  // cards on the layers a board brought in move with the board; the open session's stay with its network
  const shift = layerShift(s, tie, anchor.s);
  return (
    <group position={anchor.p} scale={anchor.s}>
      {cards.map((c) => (
        <group key={c.key} position={c.layer.session === s.session ? [0, 0, 0] : shift}>
          <OverlayCard card={c} bold={bold} dark={dark} scale={s.objectScale * s.cardScale} />
        </group>
      ))}
    </group>
  );
}

function OverlayCard({ card, bold, dark, scale }: { card: CardSpec; bold: string | null; dark: boolean; scale: number }) {
  const options = useStore().ccg;
  const group = useRef<Group>(null);
  const camera = useThree((t) => t.camera);
  const a = card.layer.neurons[card.ref];
  const b = card.layer.neurons[card.tgt];
  const near = useNear(group, SIZE.w * scale);
  const texture = useMemo(() => drawOverlay(card.curves, `${card.layer.session} #${a?.id} → #${b?.id}`, bold, card.picked, options, near),
    [card.curves, bold, card.picked, dark, a?.id, b?.id, card.layer.session, options, near]);
  useEffect(() => () => texture.dispose(), [texture]);
  const [w, h] = [SIZE.w * scale, SIZE.h * scale];
  const pos = useMemo(() => card.at.clone().addScaledVector(card.side, h * 0.6 + 0.3), [card.at, card.side, h]);
  useFrame(() => group.current?.quaternion.copy(camera.quaternion));   // a billboard: always faces the viewer
  return (
    <group ref={group} position={pos} renderOrder={card.picked ? 3 : 2}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} transparent />
      </mesh>
    </group>
  );
}

/** The picked dot's pair on an untied board: one card left of the board's top, every row's curve. */
export function PickCard({ dark }: { dark: boolean }) {
  const s = useStore();
  const group = useRef<Group>(null);
  const camera = useThree((t) => t.camera);
  const layer = s.pickCard;
  const board = layer?.want?.split("|")[1] ?? "";
  const st = layer ? stackOf(board) : null;
  const [, r, t] = (s.stats.pick.pair ?? "").split("|");
  const curves = useMemo(() => (layer && st && s.stats.pick.pair ? rowsWithPair(st.result, s.stats.values, s.stats.pick.pair).flatMap((i) => {
    const trace = rowTrace(layer, st.rows[i]!, Number(r), Number(t), s.ccg.norms, st.result.resolution);
    return trace ? [{ row: st.rows[i]!, trace }] : [];
  }) : []), [layer, st?.result, s.stats.pick.pair, s.ccg.norms]);
  const [a, b] = [layer?.neurons[Number(r)], layer?.neurons[Number(t)]];
  const texture = useMemo(() => (curves.length ? drawOverlay(curves, `${layer!.session} #${a?.id} → #${b?.id}`, null, true, s.ccg) : null), [curves, dark, s.ccg]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const scale = s.objectScale * s.cardScale * 1.6;
  const [w, h] = [SIZE.w * scale, SIZE.h * scale];
  useFrame(() => {
    const g = group.current;
    const at = anchors.get(board)?.at;
    if (!g || !at) return;
    g.quaternion.copy(camera.quaternion);
    g.position.copy(at).add(new Vector3(-w / 2 - 0.4, h / 2 + 0.6, 0).applyQuaternion(camera.quaternion));
  });
  if (!texture || s.ties.some((x) => x.board === board)) return null;
  return (
    <group ref={group} renderOrder={4}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} transparent />
      </mesh>
    </group>
  );
}
