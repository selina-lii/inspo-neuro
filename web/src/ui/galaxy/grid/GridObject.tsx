// A CCG grid in 3D: the front page's images, later pages as outlines behind it; the title bar drags it, ⇲ sets rows × cols.
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferGeometry, Float32BufferAttribute, Plane, Vector3, type Group, Quaternion } from "three";
import { focusPair, openPanelAt, patchPanel } from "../../../actions";
import { PICK_COLOR } from "../../../core/colors";
import { CELL, cellSize, colsOf, gapOf, optionsOf, pageSize, slotAt, styledCurve, traysOf, type CcgGrid, type GridItem } from "../../../core/grid";
import type { Quat, Vec3 } from "../../../core/stats";
import { store } from "../../../core/store";
import { patchGrid } from "../../../gridActions";
import { pick3 } from "../../../stackActions";
import { useBody } from "../select3";
import { useStore } from "../../useStore";
import { drawCcg } from "../CcgCards";
import { PANEL_PX } from "../Panels3D";
import { modKey, pointer } from "../pointer";
import { claimMenu } from "../SpaceMenu";
import { Corners } from "../stats/BoardCorners";
import { useBoardDrag } from "../stats/boardDrag";
import { Label3D } from "../stats/Label3D";
import { anchors, centers, ports } from "../tie/portAt";
import { drawOverlay } from "../tie/OverlayCards";
import { useGridItems } from "./gridItems";
import { syncFeeds, testsFedBy } from "../../../feedActions";
import { newScale, pickPair } from "../../../statsActions";
import { useNear } from "../useNear";
import { selected3 } from "../../../core/select";

const BAR = 0.44;
const HINT_PAGES = 5;

const rect = (x0: number, y0: number, x1: number, y1: number, z: number) => [x0, y0, z, x1, y0, z, x1, y0, z, x1, y1, z, x1, y1, z, x0, y1, z, x0, y1, z, x0, y0, z];

export function GridObject({ grid, dark }: { grid: CcgGrid; dark: boolean }) {
  const s = useStore();
  const items = useGridItems(grid);
  const group = useRef<Group>(null);
  const camera = useThree((t) => t.camera);
  const n = grid.segMode === "series" ? Math.max(1, ...items.map((x) => x.curves.length)) : 1;
  const per = colsOf(grid) * grid.rows;
  const order = useMemo(() => items.map((x) => x.key), [items]);
  const pages = Math.max(1, Math.ceil(items.length / per));
  const page = Math.min(grid.page, pages - 1);
  const { w, h } = pageSize(grid, n);
  const picked = selected3(s, "grid", grid.id);
  const drag = useBoardDrag(grid.id, group, (p, q) => patchGrid(grid.id, { p, q }), "grid");
  const body = useBody("grid", grid.id, group);
  const scale = s.objectScale * (grid.s ?? 1);

  useEffect(() => {
    if (!grid.summon) return;
    // a new grid comes to the middle of the view, facing the camera
    const ahead = camera.getWorldDirection(new Vector3());
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    // near enough to fill most of the view, so it sits in front of everything else
    const k = grid.s ?? newScale();
    const size = s.objectScale * k;
    const at = camera.position.clone().addScaledVector(ahead, Math.max(w, h * 1.6) * size * 1.1).addScaledVector(right, (-w / 2) * size).addScaledVector(up, (h / 2) * size);
    patchGrid(grid.id, { summon: false, s: k, p: at.toArray() as Vec3, q: camera.quaternion.toArray() as Quat });
  }, [grid.summon]);

  useEffect(() => void (grid.page > pages - 1 && patchGrid(grid.id, { page: pages - 1 })), [grid.page, pages]);

  const feeds = testsFedBy(grid.id).map((t) => t.id).join();
  useEffect(() => syncFeeds(grid, order), [order.join(), grid.segments.join(), grid.source, items, feeds]);

  // a pair focused elsewhere brings up the page that holds it
  const focusKey = s.stats.pick.pair ?? (s.focus?.kind === "pair" ? `${s.session}|${s.focus.ref}|${s.focus.tgt}` : null);
  useEffect(() => {
    const at = focusKey ? order.indexOf(focusKey) : -1;
    if (at >= 0 && Math.floor(at / per) !== page) patchGrid(grid.id, { page: Math.floor(at / per) });
  }, [focusKey]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    anchors.set(`grid:${grid.id}`, { at: g.localToWorld(new Vector3(0, BAR, 0)), q: g.getWorldQuaternion(new Quaternion()), scale: g.getWorldScale(new Vector3()).x, size: Math.max(w, h), width: w });
    ports.set(`grid:${grid.id}`, g.localToWorld(new Vector3(w + 0.25, BAR / 2, 0)));
    centers.set(`grid:${grid.id}`, { at: g.localToWorld(new Vector3(w / 2, -h / 2, 0)), size: Math.max(w, h) * g.scale.x });
  });

  const hints = useMemo(() => {
    const out: number[] = [];
    const later = Math.min(HINT_PAGES, pages - page - 1);
    for (let k = 1; k <= later; k++) out.push(...rect(0, -h, w, 0, -k * CELL.depth));
    return new BufferGeometry().setAttribute("position", new Float32BufferAttribute(out, 3));
  }, [w, h, page, pages]);
  const frame = useMemo(() => new BufferGeometry().setAttribute("position", new Float32BufferAttribute(rect(-0.1, -h - 0.1, w + 0.1, BAR, 0), 3)), [w, h]);
  const trays = traysOf(s, grid);
  const title = `CCG grid · ${sourceLabel(grid.source)}${trays.length > 1 ? ` · tray ${trays.indexOf(grid) + 1}/${trays.length}` : ""} · ${items.length} pairs${pages > 1 ? ` · page ${page + 1}/${pages}` : ""}`;

  return (
    <group ref={group} position={grid.p} quaternion={grid.q} scale={scale} {...body} onContextMenu={() => claimMenu({ kind: "grid", id: grid.id })}>
      <mesh position={[w / 2, BAR / 2, -0.01]} {...drag} onClick={(e) => e.delta <= 4 && (e.stopPropagation(), pick3("grid", grid.id))}>
        <planeGeometry args={[w + 0.2, BAR]} />
        <meshBasicMaterial color={picked ? PICK_COLOR : "#3a6df0"} transparent opacity={0.85} side={2} />
      </mesh>
      <Label3D text={title} position={[0.05, BAR / 2, 0]} height={0.24} color="#ffffff" anchor="left" bold />
      <lineSegments geometry={frame}><lineBasicMaterial color={picked ? PICK_COLOR : "#3a6df0"} transparent opacity={0.6} /></lineSegments>
      {items.slice(page * per, (page + 1) * per).map((item, i) => (
        <Cell key={item.key} item={item} grid={grid} n={n} at={slotAt(grid, n, i)} dark={dark} group={group} order={order} />
      ))}
      {/* later pages: outlines only; a click on one brings its page to the front */}
      <lineSegments geometry={hints}><lineBasicMaterial color={dark ? "#8b919c" : "#7a7f88"} transparent opacity={0.35} /></lineSegments>
      {Array.from({ length: Math.min(HINT_PAGES, pages - page - 1) }, (_, k) => (
        <mesh key={k} position={[w / 2, -h / 2, -(k + 1) * CELL.depth]} onClick={(e) => e.delta <= 4 && (e.stopPropagation(), patchGrid(grid.id, { page: page + k + 1 }))}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={2} />
        </mesh>
      ))}
      {picked && (
        <>
          <Corners group={group} box={[-0.1, -h - 0.1, w + 0.1, BAR]} size={grid.s ?? 1} onResize={(k) => patchGrid(grid.id, { s: k })} />
          <SlotHandle grid={grid} n={n} at={[w + 0.1, -h - 0.1]} group={group} />
        </>
      )}
    </group>
  );
}

const sourceLabel = (source: string | null) => {
  if (!source) return "not cabled";
  const [kind, id] = source.split(":");
  if (kind === "node") return "pair filter";
  if (kind === "board") return store.get().stats.tests.find((t) => t.id === id)?.name || "unsaved test";
  return id === "main" ? `network ${store.get().session}` : `network · ${store.get().networks.find((x) => x.id === id)?.segment ?? id}`;
};

/** One pair: its curves overlaid in one image, or one image per curve in series. */
// the card a shift-click runs from: the last one clicked in any grid
let anchor = "";
// a drag across cards in select mode: from where, adding or dropping, over what was picked before
let sweep: { order: string[]; from: number; add: boolean; base: Set<string> } | null = null;

function paint(key: string): void {
  if (!sweep) return;
  const to = sweep.order.indexOf(key);
  const cells = new Set(sweep.base);
  for (const k of sweep.order.slice(Math.min(sweep.from, to), Math.max(sweep.from, to) + 1)) sweep.add ? cells.add(k) : cells.delete(k);
  store.set({ cells });
}

function endSweep(): void {
  sweep = null;
  pointer.busy = false;
}

function Cell({ item, grid, n, at, dark, group, order }: { item: GridItem; grid: CcgGrid; n: number; at: [number, number]; dark: boolean; group: React.RefObject<Group | null>; order: string[] }) {
  const s = useStore();
  const o = optionsOf(s, grid);
  // an open legend cabled to the grid keys every cell at once
  const keyed = s.panels.some((p) => p.id === grid.legend && !p.closed);
  const cells = useRef<Group>(null);
  const near = useNear(cells, CELL.w);
  const focused = s.cells.has(item.key) || (s.session === item.session && s.focus?.kind === "pair" && s.focus.ref === item.ref && s.focus.tgt === item.tgt);
  // a list's info line names the pair once, so its cards carry only their segment
  const title = grid.list ? "" : item.title;
  const style = s.styleNodes.find((n) => n.id === grid.style);
  const textures = useMemo(() => {
    if (!item.curves.length) return [];
    const styled = item.curves.map((c) => styledCurve(s, grid, c));
    if (grid.segMode === "overlay") {
      const curves = styled.sort((a, b) => a.layer - b.layer).map((c) => ({ row: { name: keyed ? "" : c.label, color: c.color, segments: [] }, trace: c.trace, width: c.width, alpha: c.alpha }));
      return [drawOverlay(curves, title, null, focused, o, near)];
    }
    return styled.map((c) => drawCcg(c.trace, title ? `${title} · ${c.label}` : c.label, c.color, focused, { options: o, base: c.color, width: c.width, alpha: c.alpha }, near));
  }, [item, grid.segMode, focused, dark, o, near, keyed, title, style]);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  const c = cellSize(grid, n);
  const step = grid.axis === "x" ? [CELL.w, 0] : [0, -CELL.h];
  const first = grid.segMode === "series" ? [at[0] - c.w / 2 + CELL.w / 2, at[1] + c.h / 2 - CELL.h / 2] : at;
  // a pair clicked here does what its dot on the board does; without a board, it focuses the pair
  const pick = (it: GridItem, e: ThreeEvent<MouseEvent>) => {
    // ⌘ picks or drops one card, shift picks the run of cards from the last one clicked; tags and moves act on them
    const from = order.indexOf(anchor), to = order.indexOf(it.key);
    if (e.shiftKey && from >= 0) return store.set({ cells: new Set([...s.cells, ...order.slice(Math.min(from, to), Math.max(from, to) + 1)]) });
    anchor = it.key;
    if (modKey(e.nativeEvent)) {
      const cells = new Set(s.cells);
      if (!cells.delete(it.key)) cells.add(it.key);
      return store.set({ cells });
    }
    if (s.cells.size) store.set({ cells: new Set() });
    const [kind, id] = (grid.source ?? ":").split(":");
    const board = kind === "board" ? id : s.ties.find((t) => t.network === id)?.board;
    if (board) pickPair(board, it.session, it.ref, it.tgt);
    else if (it.session === s.session) focusPair(it.ref, it.tgt);
    // the CCG config cabled to this grid shows the clicked pair, whatever its session
    if (grid.config) patchPanel(grid.config, { pair: it.key });
  };
  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (item.session !== s.session) return;
    focusPair(item.ref, item.tgt);
    const g = group.current!;
    const st = store.get();
    const panel = st.panels.find((p) => p.id === "ccg")!;
    const p = g.localToWorld(new Vector3(at[0] + c.w / 2 + (panel.w * PANEL_PX) / 2 / (grid.s ?? 1) + 0.3, at[1], 0.1));
    openPanelAt("ccg", { ...panel.pose, p: p.toArray() as Vec3, q: grid.q });
  };
  if (!textures.length) {
    const outline = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(rect(at[0] - c.w / 2, at[1] - c.h / 2, at[0] + c.w / 2, at[1] + c.h / 2, 0), 3));
    return <lineSegments geometry={outline}><lineBasicMaterial color="#9aa0a6" transparent opacity={0.6} /></lineSegments>;
  }
  const groups = item.groups.filter((g) => !g.startsWith("__"));
  const info = `${item.title} · ${item.strength.toFixed(2)}${grid.segments.length > 1 ? ` · on ${item.on}/${grid.segments.length}` : ""}${groups.length ? ` · ${groups.join(", ")}` : ""}`;
  return (
    <group ref={cells}>
      {grid.list && <Label3D text={info} position={[at[0] - c.w / 2 - CELL.info + 0.1, at[1], 0]} height={0.22} color={focused ? PICK_COLOR : dark ? "#e3e6ea" : "#2a2d33"} anchor="left" />}
      {textures.map((t, k) => (
        <mesh key={k} userData={{ card: true }} position={[first[0]! + step[0]! * k, first[1]! + step[1]! * k, 0]}
          onClick={(e) => e.delta <= 4 && (e.stopPropagation(), !grid.picking && pick(item, e))} onDoubleClick={open}
          onPointerDown={(e) => {
            if (!grid.picking || e.button !== 0) return;
            e.stopPropagation();
            // select mode: the press picks (or drops) this card, and a drag on sweeps every card in between
            pointer.busy = true;
            anchor = item.key;
            sweep = { order, from: order.indexOf(item.key), add: !s.cells.has(item.key), base: new Set(s.cells) };
            paint(item.key);
            window.addEventListener("pointerup", endSweep, { once: true });
          }}
          onPointerEnter={() => sweep?.order === order && paint(item.key)}>
          <planeGeometry args={grid.compact ? [CELL.w, CELL.h] : [CELL.w * 0.98, CELL.h * 0.98]} />
          <meshBasicMaterial map={t} transparent opacity={s.stats.pick.pair && s.stats.pick.pair !== item.key ? 0.15 : 1} />
        </mesh>
      ))}
    </group>
  );
}

/** ⇲ at the bottom-right corner: drag it to set how many columns and rows a page holds. */
function SlotHandle({ grid, n, at, group }: { grid: CcgGrid; n: number; at: [number, number]; group: React.RefObject<Group | null> }) {
  const plane = useRef<Plane | null>(null);
  const c = cellSize(grid, n);
  return (
    <group position={[at[0], at[1], 0.02]}>
      <mesh
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          (e.target as unknown as Element).setPointerCapture(e.pointerId);
          const g = group.current!;
          plane.current = new Plane().setFromNormalAndCoplanarPoint(new Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(g.quaternion.clone())), g.getWorldPosition(new Vector3()));
          pointer.busy = true;
        }}
        onPointerMove={(e) => {
          if (!plane.current) return;
          e.stopPropagation();
          const hit = e.ray.intersectPlane(plane.current, new Vector3());
          if (!hit) return;
          const local = group.current!.worldToLocal(hit);
          const gap = gapOf(grid);
          const cols = grid.list ? grid.cols : Math.max(1, Math.round((local.x + gap) / (c.w + gap)));
          const rows = Math.max(1, Math.round((-local.y + gap) / (c.h + gap)));
          if (cols !== grid.cols || rows !== grid.rows) patchGrid(grid.id, { cols, rows, page: 0 });
        }}
        onPointerUp={(e) => {
          if (!plane.current) return;
          e.stopPropagation();
          plane.current = null;
          pointer.busy = false;
        }}>
        <circleGeometry args={[0.28, 20]} />
        <meshBasicMaterial color={PICK_COLOR} />
      </mesh>
      <Label3D text="⇲" position={[0, 0, 0.01]} height={0.3} color="#ffffff" />
    </group>
  );
}
