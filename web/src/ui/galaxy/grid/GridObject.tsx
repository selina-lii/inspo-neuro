// A CCG grid in 3D: the front page's images, later pages as outlines behind it; the title bar drags it, ⇲ sets rows × cols.
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferGeometry, Float32BufferAttribute, Plane, Vector3, type Group, Quaternion } from "three";
import { focusPair, openPanelAt } from "../../../actions";
import { PICK_COLOR } from "../../../core/colors";
import { CELL, cellSize, gapOf, optionsOf, sourceOf, pageSize, slotAt, type CcgGrid, type GridItem } from "../../../core/grid";
import type { Quat, Vec3 } from "../../../core/stats";
import { store } from "../../../core/store";
import { patchGrid } from "../../../gridActions";
import { pick3 } from "../../../stackActions";
import { useBody } from "../select3";
import { useStore } from "../../useStore";
import { drawCcg } from "../CcgCards";
import { PANEL_PX } from "../Panels3D";
import { pointer } from "../pointer";
import { claimMenu } from "../SpaceMenu";
import { Corners } from "../stats/BoardCorners";
import { useBoardDrag } from "../stats/boardDrag";
import { Label3D } from "../stats/Label3D";
import { anchors, centers, ports } from "../tie/portAt";
import { drawOverlay } from "../tie/OverlayCards";
import { useGridItems } from "./gridItems";
import { pickPair } from "../../../statsActions";
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
  const per = grid.cols * grid.rows;
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
    const at = camera.position.clone().addScaledVector(ahead, Math.max(w, h * 1.6) * scale * 1.1).addScaledVector(right, (-w / 2) * scale).addScaledVector(up, (h / 2) * scale);
    patchGrid(grid.id, { summon: false, p: at.toArray() as Vec3, q: camera.quaternion.toArray() as Quat });
  }, [grid.summon]);

  useEffect(() => void (grid.page > pages - 1 && patchGrid(grid.id, { page: pages - 1 })), [grid.page, pages]);

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
  const title = `CCG grid · ${sourceLabel(grid.source)} · ${items.length} pairs${pages > 1 ? ` · page ${page + 1}/${pages}` : ""}`;

  return (
    <group ref={group} position={grid.p} quaternion={grid.q} scale={scale} {...body} onContextMenu={() => claimMenu({ kind: "grid", id: grid.id })}>
      <mesh position={[w / 2, BAR / 2, -0.01]} {...drag} onClick={(e) => e.delta <= 4 && (e.stopPropagation(), pick3("grid", grid.id))}>
        <planeGeometry args={[w + 0.2, BAR]} />
        <meshBasicMaterial color={picked ? PICK_COLOR : "#3a6df0"} transparent opacity={0.85} side={2} />
      </mesh>
      <Label3D text={title} position={[0.05, BAR / 2, 0]} height={0.24} color="#ffffff" anchor="left" bold />
      <lineSegments geometry={frame}><lineBasicMaterial color={picked ? PICK_COLOR : "#3a6df0"} transparent opacity={0.6} /></lineSegments>
      {items.slice(page * per, (page + 1) * per).map((item, i) => (
        <Cell key={item.key} item={item} grid={grid} n={n} at={slotAt(grid, n, i)} dark={dark} group={group} />
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
function Cell({ item, grid, n, at, dark, group }: { item: GridItem; grid: CcgGrid; n: number; at: [number, number]; dark: boolean; group: React.RefObject<Group | null> }) {
  const s = useStore();
  const o = optionsOf(s, grid);
  const cells = useRef<Group>(null);
  const near = useNear(cells, CELL.w);
  const focused = s.cells.has(item.key) || (s.session === item.session && s.focus?.kind === "pair" && s.focus.ref === item.ref && s.focus.tgt === item.tgt);
  const textures = useMemo(() => {
    if (!item.curves.length) return [];
    if (grid.segMode === "overlay") {
      const curves = item.curves.map((c) => ({ row: { name: c.label, color: c.color, segments: [] }, trace: c.trace }));
      return [drawOverlay(curves, item.title, null, focused, o, near)];
    }
    return item.curves.map((c) => drawCcg(c.trace, `${item.title} · ${c.label}`, c.color, focused, { options: o, base: c.color }, near));
  }, [item, grid.segMode, focused, dark, o, near]);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  const c = cellSize(grid, n);
  const step = grid.axis === "x" ? [CELL.w, 0] : [0, -CELL.h];
  const first = grid.segMode === "series" ? [at[0] - c.w / 2 + CELL.w / 2, at[1] + c.h / 2 - CELL.h / 2] : at;
  // a pair clicked here does what its dot on the board does; without a board, it focuses the pair
  const pick = (it: GridItem, e: ThreeEvent<MouseEvent>) => {
    // shift or ⌘: add the pair to (or drop it from) the cells that tags and moves act on
    if (e.shiftKey || e.metaKey) {
      const cells = new Set(s.cells);
      if (!cells.delete(it.key)) cells.add(it.key);
      return store.set({ cells });
    }
    if (s.cells.size) store.set({ cells: new Set() });
    const [kind, id] = (sourceOf(s, grid) ?? ":").split(":");
    const board = kind === "board" ? id : s.ties.find((t) => t.network === id)?.board;
    if (board) pickPair(board, it.session, it.ref, it.tgt);
    else if (it.session === s.session) focusPair(it.ref, it.tgt);
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
  return (
    <group ref={cells}>
      {textures.map((t, k) => (
        <mesh key={k} position={[first[0]! + step[0]! * k, first[1]! + step[1]! * k, 0]}
          onClick={(e) => e.delta <= 4 && (e.stopPropagation(), pick(item, e))} onDoubleClick={open}>
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
          const cols = Math.max(1, Math.round((local.x + gap) / (c.w + gap)));
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
