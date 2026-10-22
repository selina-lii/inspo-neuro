// A CCG grid: small CCG images of many pairs as one object in 3D, sorted and paged. No React, no three.
import type { Quat, Rule, Vec3 } from "./stats";
import { DEFAULT_CCG, panelCcg, type CcgOptions, type State } from "./store";
import type { Trace } from "./types";

export type GridSort = "session" | "strength" | "on" | "ref";

/** `source`: the port it is cabled to ("net:main", "net:<copy>", "board:<test>"); pages past the first stack behind it. */
export type CcgGrid = {
  id: string; p: Vec3; q: Quat; s?: number; source: string | null;
  cols: number; rows: number; sort: GridSort; segMode: "overlay" | "series"; axis: "x" | "y";
  segments: string[]; pairs: "shown" | "selected"; page: number; summon?: boolean; compact?: boolean; config?: string | null;
  legend?: string | null;   // a legend panel cabled to it: one key for the grid, so its cells drop their own
  picking?: boolean;   // select mode: a click picks a card, a drag sweeps a run of them
  tray?: string;   // the set of trays it shares its source's pairs with; each pair lives in one tray
  keys?: string[];   // the pairs this tray holds; without keys, every pair no other tray in its set holds
  list?: boolean;   // one column, an info line beside each pair
  style?: string | null;   // the style node cabled to it
};

/** How one segment's curves draw on the grids cabled to a style node. */
export type CurveStyle = { label: string; color: string; width: number; alpha: number };

/** Its curves' order is the draw order: later ones lie on top. */
export type StyleNode = { id: string; p: Vec3; q: Quat; summon?: boolean; curves: CurveStyle[] };

export const CURVE_DEFAULT = { width: 1.4, alpha: 1 };

/** A curve as the grid's style node draws it, and its layer: unstyled curves lie under the styled ones. */
export function styledCurve<C extends { label: string; color: string }>(s: State, grid: CcgGrid, c: C): C & { width?: number; alpha?: number; layer: number } {
  const curves = s.styleNodes.find((n) => n.id === grid.style)?.curves ?? [];
  const i = curves.findIndex((x) => x.label === c.label);
  return i < 0 ? { ...c, layer: -1 } : { ...c, color: curves[i]!.color, width: curves[i]!.width, alpha: curves[i]!.alpha, layer: i };
}

/** A value a pick keeps between `lo` and `hi`: a pair's strength or CS, or a neuron's firing rate, in one segment. */
export type PairRange = { field: "strength" | "cs" | "rate"; segment: string; side: string; lo: number | null; hi: number | null };

/** A pair source: the server resolves its sessions, rules, states and ranges; pairs added by hand join them. */
export type PairNode = {
  id: string; p: Vec3; q: Quat; summon?: boolean;
  sessions: string[]; rules: Rule[]; states: string[]; ranges: PairRange[]; added: string[];
};

export const PICK_DEFAULTS = { sessions: [], rules: [], states: [], ranges: [], added: [] };

/** What the server resolves a node's pick from. */
export const pickQuery = (n: PairNode) => ({ sessions: n.sessions, rules: n.rules, states: n.states, ranges: n.ranges });

/** A node's pairs: its pick's, then the ones added by hand. */
export const nodePairs = (s: State, n: PairNode): string[] => [...new Set([...(s.picks[n.id] ?? []), ...n.added])];

/** A grid draws with the options of the CCG panel cabled to it, the defaults without one. */
/** The one grid a CCG or legend panel is cabled to, which it then sits on. */
export const dockedOn = (s: State, panel: string): string | undefined => {
  const on = s.grids.filter((g) => g.config === panel || g.legend === panel);
  return on.length === 1 ? on[0]!.id : undefined;
};

export const optionsOf = (s: State, grid: CcgGrid): CcgOptions => (grid.config ? panelCcg(s, grid.config) : DEFAULT_CCG);

export type GridCurve = { label: string; color: string; trace: Trace };

export type GridItem = { key: string; session: string; ref: number; tgt: number; title: string; color: string; strength: number; on: number; groups: string[]; curves: GridCurve[] };

export const CELL = { w: 2.4, h: 1.4, gap: 0.15, depth: 1.2, info: 4 };

export const colsOf = (grid: CcgGrid) => (grid.list ? 1 : grid.cols);

/** The pairs a tray keeps: its own keys, or none of the keys its sibling trays hold. */
export function trayKeys(s: State, grid: CcgGrid): { own: boolean; keys: Set<string> } {
  if (grid.keys) return { own: true, keys: new Set(grid.keys) };
  return { own: false, keys: new Set(s.grids.filter((g) => g.tray && g.tray === grid.tray && g.keys).flatMap((g) => g.keys!)) };
}

/** The trays in a grid's set, the first one first. */
export const traysOf = (s: State, grid: CcgGrid): CcgGrid[] => (grid.tray ? s.grids.filter((g) => g.tray === grid.tray).sort((a, b) => Number(Boolean(a.keys)) - Number(Boolean(b.keys))) : [grid]);

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
  return { w: (grid.list ? CELL.info : 0) + colsOf(grid) * c.w + (colsOf(grid) - 1) * gapOf(grid), h: grid.rows * c.h + (grid.rows - 1) * gapOf(grid) };
}

/** The centre of slot *i* on a page. */
export function slotAt(grid: CcgGrid, n: number, i: number): [number, number] {
  const c = cellSize(grid, n);
  const [col, row] = [i % colsOf(grid), Math.floor(i / colsOf(grid))];
  return [(grid.list ? CELL.info : 0) + col * (c.w + gapOf(grid)) + c.w / 2, -(row * (c.h + gapOf(grid)) + c.h / 2)];
}
