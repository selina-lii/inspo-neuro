// A tied network's session stack: the open session stays where it is, each other session of the test is a layer behind it
// along -z, in its physical layout with shanks lined up by id; the board stands on the stack's side wall. Links on a layer follow the playback row's segment.
import { useEffect, useMemo } from "react";
import { linkStyle } from "../../../core/colors";
import { pairHidden, physicalLayout } from "../../../core/derive";
import { rowSegment, type StackLayer, type Tie } from "../../../core/stack";
import { axisQuat, type Vec3 } from "../../../core/stats";
import { store, type State } from "../../../core/store";
import { linkKey, type Link, type Neuron, type Point3 } from "../../../core/types";
import { ensureStack, stackOf, tiedPairs } from "../../../stackActions";
import { moveBoard, pickPair } from "../../../statsActions";
import { useStore } from "../../useStore";
import { buildBatches, Heads, LinkBatch, Neurons, ProbeShank } from "../networkParts";
import { claimMenu } from "../SpaceMenu";
import { ROW_W } from "../stats/boardGeometry";
import { Label3D } from "../stats/Label3D";
import { positions3, probes, type Probe } from "../layout3";
import type { SceneBox } from "../Panels3D";

/** Share of the metric height a stacked layer keeps, so layers stay thin. */
export const STACK_LIFT = 0.2;

/** Layer spacing: wider than a stacked layer's metric lift. */
export const layerGap = (spacing: number) => 8 * spacing * STACK_LIFT + 4;

/** A layer as drawn: one session's neurons at their stack positions (local to the anchor network). */
export type DrawnLayer = { session: string; neurons: Neuron[]; links: Link[]; pts: Point3[]; probes: Probe[]; z: number; data: StackLayer | undefined };

/** Where the tied network sits: the main one at its offset, a copy at its own place and size. */
export function anchorOf(s: State, network: string, center: Vec3): { p: Vec3; s: number } {
  const net = s.networks.find((n) => n.id === network);
  if (!net) return { p: s.mainAt, s: 1 };
  const k = net.s ?? 1;
  return { p: [net.p[0] - center[0] * k, net.p[1] - center[1] * k, net.p[2] - center[2] * k], s: k };
}

/** How far the layers a board brought in have moved with it, in the anchor's own units. */
export function layerShift(s: State, tie: Tie, anchorScale: number): Vec3 {
  const p = s.stats.boards.find((b) => b.id === tie.board)?.pose.p;
  if (!p || !tie.at) return [0, 0, 0];
  return [0, 1, 2].map((i) => (p[i]! - tie.at![i]!) / anchorScale) as Vec3;
}

/** The stack's layers for a tie, the open session first at the anchor's own depth. */
export function useLayers(tie: Tie, mainPts: Point3[], mainProbes: Probe[]): DrawnLayer[] {
  const s = useStore();
  const st = stackOf(tie.board);
  const sessions = st?.sessions ?? [];
  const others = sessions.filter((x) => x !== s.session);
  const gap = layerGap(s.spacing);
  const z0 = mainPts.length ? mainPts.reduce((a, p) => a + p.z, 0) / mainPts.length : 0;
  return useMemo(() => {
    const home = new Map(mainProbes.map((p) => [p.shank.id, p.x]));
    const open: DrawnLayer = { session: s.session ?? "", neurons: s.neurons, links: s.links, pts: mainPts, probes: mainProbes, z: 0, data: s.stack[s.session ?? ""] };
    return [open, ...others.map((session, i) => {
      const data = s.stack[session];
      if (!data) return { session, neurons: [], links: [], pts: [], probes: [], z: -(i + 1) * gap, data };
      const input = { layout: "physical" as const, embedding3: null, positions: physicalLayout(data.neurons, data.shanks, s.spacing), neurons: data.neurons, links: data.links, shanks: data.shanks, zMetric: s.zMetric, spacing: s.spacing, lift: STACK_LIFT };
      const pr = probes(data.neurons, data.shanks, s.spacing);
      // shift sideways so shanks with the same id sit over each other
      const shared = pr.filter((p) => home.has(p.shank.id));
      const dx = shared.length ? shared.reduce((a, p) => a + home.get(p.shank.id)! - p.x, 0) / shared.length : 0;
      const z = -(i + 1) * gap;
      const pts = positions3(input, new Set()).map((p) => ({ x: p.x + dx, y: p.y, z: p.z + z }));
      return { session, neurons: data.neurons, links: data.links, pts, probes: pr.map((p) => ({ ...p, x: p.x + dx })), z: z + z0, data };
    })];
  }, [others.join(), s.stack, mainPts, mainProbes, s.spacing, s.zMetric, s.session, s.neurons, s.links, gap]);
}

/** Put a tied board on the stack's side wall: right of the layers, facing +x, its rows running back along the stack's depth. */
export function arrangeTie(tie: Tie, box: SceneBox, center: Vec3, layers: DrawnLayer[]): void {
  const s = store.get();
  const st = stackOf(tie.board);
  const board = s.stats.boards.find((b) => b.id === tie.board);
  if (!st || !board) return;
  const n = st.sessions.filter((x) => x !== s.session).length;
  const anchor = anchorOf(s, tie.network, center);
  const gap = layerGap(s.spacing);
  const size = board.pose.s ?? 1;
  // right of every layer's neurons and shanks, cleared by half a row too: the violins and dots stand out of the board's plane
  const right = Math.max(box.x1, ...layers.flatMap((l) => [...l.pts.map((p) => p.x), ...l.probes.map((p) => p.x)]));
  const clear = 3 + (ROW_W / 2) * size * s.objectScale / anchor.s;
  // each board tied to this network stands one board-depth further out
  const k = s.ties.filter((t) => t.network === tie.network).findIndex((t) => t.board === tie.board);
  const local: Vec3 = [right + clear * (1 + 2 * k), (box.y0 + box.y1) / 2, box.z - (n * gap) / 2];
  moveBoard(tie.board, { p: local.map((v, i) => anchor.p[i]! + v * anchor.s) as Vec3, q: axisQuat("+x") });
}

/** The layers behind one tied network, its session labels, and the playback row's segment on each. */
export function StackLayers({ tie, layers, center, dark }: { tie: Tie; layers: DrawnLayer[]; center: Vec3; dark: boolean }) {
  const s = useStore();
  const st = stackOf(tie.board);
  useEffect(() => ensureStack(tie.board), [tie.board, st?.result, st?.sessions.join(), s.ccg.norms.join()]);
  const anchor = anchorOf(s, tie.network, center);
  const row = s.playback?.board === tie.board && st ? st.rows[s.playback.row] : null;
  const [pickSession, pickRef, pickTgt] = (s.stats.pick.pair ?? "").split("|");
  const shift = layerShift(s, tie, anchor.s);
  return (
    <group position={anchor.p} scale={anchor.s}>
      {layers.map((layer, i) => (i === 0 && s.mainHidden) ? null : (() => {
        const top = Math.max(...layer.probes.map((p) => p.y1), ...layer.pts.map((p) => p.y), 0) + 2.2;
        const x0 = Math.min(...layer.probes.map((p) => p.x), ...layer.pts.map((p) => p.x), 0);
        const seg = row && layer.data ? rowSegment(layer.data, row) : null;
        const label = `${layer.session}${seg ? ` · ${row!.name} (${seg})` : row ? ` · ${row.name}: not in this session` : ""}`;
        return (
          <group key={layer.session} position={i > 0 ? shift : [0, 0, 0]} onContextMenu={i > 0 ? () => claimMenu({ kind: "tie", id: tie.board }) : undefined}>
            <Label3D text={label} position={[x0, top, layer.z]} height={0.5} color={dark ? "#e6e7ea" : "#23252a"} anchor="left" bold />
            {i > 0 && (layer.data
              ? <Layer board={tie.board} network={tie.network} layer={layer} segment={seg} picked={pickSession === layer.session ? linkKey(Number(pickRef), Number(pickTgt)) : null} dark={dark} />
              : <Label3D text="loading…" position={[x0, top - 1, layer.z]} height={0.4} color="#8a8f98" anchor="left" />)}
          </group>
        );
      })())}
    </group>
  );
}

const NO_HIDE = () => false;

function Layer({ board, network, layer, segment, picked, dark }: { board: string; network: string; layer: DrawnLayer; segment: string | null; picked: string | null; dark: boolean }) {
  const s = useStore();
  // a stack is no regular view: only the test's own pairs, the other neurons see-through
  const inTest = tiedPairs(network, layer.session) ?? new Set<string>();
  const inTestKey = [...inTest].join();
  // a picked pair stays lit, drawn even when the filters hide it; the rest dims, and a pick in another session dims it all
  const solo = useMemo(() => (picked ? layer.links.find((l) => linkKey(l.ref, l.tgt) === picked) ?? null : null), [layer.links, picked]);
  const shown = useMemo(() => {
    const keep = layer.links.filter((l) => inTest.has(linkKey(l.ref, l.tgt)) && !pairHidden(s.filters, layer.neurons, l.ref, l.tgt));
    return solo && !keep.includes(solo) ? [...keep, solo] : keep;
  }, [layer.links, s.filters, layer.neurons, solo, inTestKey]);
  const away = Boolean(s.stats.pick.pair) && !solo;
  const faded = useMemo(() => {
    const ends = new Set((solo ? [solo] : shown).flatMap((l) => [l.ref, l.tgt]));
    return (idx: number) => !ends.has(idx);
  }, [shown, solo]);
  const view = useMemo(() => ({ ...s, neurons: layer.neurons, links: layer.links, segLinks: layer.data!.segLinks }), [s, layer]);
  const map = useMemo(() => ({ id: `stack:${layer.session}`, segment: segment ?? "all", dx: 0, dy: 0 }), [layer.session, segment]);
  const styles = useMemo(() => new Map(shown.map((l) => [l.i, linkStyle(view, map, l)])), [shown, view, map]);
  const pickedSet = useMemo(() => new Set(picked ? [picked] : []), [picked]);
  const batches = useMemo(() => buildBatches(shown, styles, {
    solo, touch: null, picked: pickedSet, alpha: s.linkAlpha * (away ? 0.15 : 1),
    // during playback a link off in the row's segment fades
    off: (l) => Boolean(segment) && layer.data!.segLinks[segment!]?.on[l.i] === false,
  }), [shown, styles, solo, away, pickedSet, s.linkAlpha, segment, layer.data]);
  return (
    <>
      {layer.probes.map((p) => (
        <group key={p.shank.id} position={[0, 0, layer.z]}>
          <ProbeShank probe={p} open={false} onHover={() => undefined} onClick={() => undefined} />
        </group>
      ))}
      {batches.map((b) => <LinkBatch key={b.key} batch={b} pts={layer.pts} dark={dark} onHover={() => undefined} onPick={(ref, tgt) => pickPair(board, layer.session, ref, tgt)} />)}
      <Heads links={shown} styles={styles} pts={layer.pts} touch={null} />
      <Neurons pts={layer.pts} touch={null} hidden={NO_HIDE} faded={faded} onHover={() => undefined} layer={layer.neurons} />
    </>
  );
}
