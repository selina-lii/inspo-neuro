// A CCG grid: small CCG images of many pairs as one object in 3D, sorted and paged. No React, no three.
import type { Quat, Vec3 } from "./stats";
import { DEFAULT_CCG, panelCcg, type CcgOptions, type State } from "./store";
import type { Trace } from "./types";

export type GridSort = "session" | "strength" | "on" | "ref";

/** `source`: the port it is cabled to ("net:main", "net:<copy>", "board:<test>"); pages past the first stack behind it. */
export type CcgGrid = {
  id: string; p: Vec3; q: Quat; s?: number; source: string | null;
  cols: number; rows: number; sort: GridSort; segMode: "overlay" | "series"; axis: "x" | "y";
  segments: string[]; pairs: "shown" | "selected"; page: number; summon?: boolean; compact?: boolean; config?: string | null;
};

/** A node between a source and its grids: it passes on only the pairs its mode keeps. */
export type PairMode = "all" | "selected" | "picked";
export type PairNode = { id: string; p: Vec3; q: Quat; source: string | null; mode: PairMode; summon?: boolean };

/** The port a grid's pairs come from, through its pair node if it has one. */
export const sourceOf = (s: State, grid: CcgGrid): string | null =>
  grid.source?.startsWith("node:") ? s.pairNodes.find((n) => `node:${n.id}` === grid.source)?.source ?? null : grid.source;

/** A grid draws with the options of the CCG panel cabled to it, the defaults without one. */
/** The one grid a CCG panel is cabled to, which it then sits on. */
export const dockedOn = (s: State, panel: string): string | undefined => {
  const on = s.grids.filter((g) => g.config === panel);
  return on.length === 1 ? on[0]!.id : undefined;
};

export const optionsOf = (s: State, grid: CcgGrid): CcgOptions => (grid.config ? panelCcg(s, grid.config) : DEFAULT_CCG);

export type GridCurve = { label: string; color: string; trace: Trace };

export type GridItem = { key: string; session: string; ref: number; tgt: number; title: string; color: string; strength: number; on: number; curves: GridCurve[] };

export const CELL = { w: 2.4, h: 1.4, gap: 0.15, depth: 1.2 };

/** The space between cells: none when compact. */
export const gapOf = (grid: CcgGrid) => (grid.compact ? 0 : CELL.gap);

export function sortItems(items: GridItem[], sort: GridSort, sessions: string[]): GridItem[] {
  const order = new Map(sessions.map((s, i) => [s, i]));
  const by: Record<GridSort, (a: GridItem, b: GridItem) => number> = {
    session: (a, b) => (order.get(a.session) ?? 0) - (order.get(b.session) ?? 0) || a.ref - b.ref || a.tgt - b.tgt,
    strength: (a, b) => b.strength - a.strength,
    on: (a, b) => b.on - a.on || b.strength - a.strength,
    ref: (a, b) => a.ref - b.ref || a.tgt - b.tgt,
  };
  return [...items].sort(by[sort]);
}

/** One pair's footprint: a single image when overlaid, its curves side by side along the axis in series. */
export function cellSize(grid: CcgGrid, n: number): { w: number; h: number } {
  const k = grid.segMode === "series" ? Math.max(n, 1) : 1;
  return { w: CELL.w * (grid.axis === "x" ? k : 1), h: CELL.h * (grid.axis === "y" ? k : 1) };
}

/** The grid's front face, in its own frame: left edge at x 0, top edge at y 0. */
export function pageSize(grid: CcgGrid, n: number): { w: number; h: number } {
  const c = cellSize(grid, n);
  return { w: grid.cols * c.w + (grid.cols - 1) * gapOf(grid), h: grid.rows * c.h + (grid.rows - 1) * gapOf(grid) };
}

/** The centre of slot *i* on a page. */
export function slotAt(grid: CcgGrid, n: number, i: number): [number, number] {
  const c = cellSize(grid, n);
  const [col, row] = [i % grid.cols, Math.floor(i / grid.cols)];
  return [col * (c.w + gapOf(grid)) + c.w / 2, -(row * (c.h + gapOf(grid)) + c.h / 2)];
}
