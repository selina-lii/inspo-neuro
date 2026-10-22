// A CCG grid: small CCG images of many pairs as one object in 3D, sorted and paged. No React, no three.
import type { Quat, Rule, Vec3 } from "./stats";
import { DEFAULT_CCG, panelCcg, type CcgOptions, type State } from "./store";
import { strongestFirst } from "./pairs";
import type { Trace } from "./types";
import { gridConfig, gridLegend, gridStyle } from "./wires";

export type GridSort = "session" | "strength" | "on" | "ref";

/** Pages past the first stack behind it; what it is cabled to lives in the wires. */
export type CcgGrid = {
  id: string; p: Vec3; q: Quat; s?: number; label?: string;
  cols: number; rows: number; sort: GridSort; segMode: "overlay" | "series"; axis: "x" | "y";
  segments: string[]; pairs: "shown" | "selected"; page: number; summon?: boolean;
  picking?: boolean;   // select mode: a click picks a card, a drag sweeps a run of them
  tray?: string;   // the set of trays it shares its source's pairs with; a pair may sit in several, once in each
  keys?: string[];   // the pairs this tray holds; the set's first tray has none and holds every pair but its `out`
  out?: string[];
  list?: boolean;   // one column, an info line beside each pair
  view?: "ccg" | "stats";   // stats: each card plots the pair's value per curve, as its linked test measures it
  metric?: string;   // the stats metric that view plots
  sameScale?: boolean;   // every card on one y range, the grid's whole
  xlim?: [number | null, number | null];   // a one-off lag window (ms) for its CCG cards, null an open end; never saved
  layoutOpen?: boolean;   // its bar shows the layout settings
};

/** How one segment's curves draw on the grids cabled to a style node. */
export type CurveStyle = { label: string; color: string; width: number; alpha: number };

/** Its curves' order is the draw order: later ones lie on top. */
export type StyleNode = { id: string; p: Vec3; q: Quat; summon?: boolean; curves: CurveStyle[]; label?: string };

export const CURVE_DEFAULT = { width: 1.4, alpha: 1 };

/** A curve as the grid's style node draws it, and its layer: unstyled curves lie under the styled ones. */
export function styledCurve<C extends { label: string; color: string }>(s: State, grid: CcgGrid, c: C): C & { width?: number; alpha?: number; layer: number } {
  const curves = s.styleNodes.find((n) => n.id === gridStyle(s, grid.id))?.curves ?? [];
  const i = curves.findIndex((x) => x.label === c.label);
  return i < 0 ? { ...c, layer: -1 } : { ...c, color: curves[i]!.color, width: curves[i]!.width, alpha: curves[i]!.alpha, layer: i };
}

/** A value a pick keeps between `lo` and `hi`: a pair's strength or CS, or a neuron's firing rate, in one segment. */
export type PairRange = { field: "strength" | "cs" | "rate"; segment: string; side: string; lo: number | null; hi: number | null };

/** A pair source: the server resolves its sessions, rules, states and ranges; pairs added by hand join them. */
export type PairNode = {
  id: string; p: Vec3; q: Quat; summon?: boolean; label?: string;
  sessions: string[]; conn_types: string[]; segments: string[]; rules: Rule[]; states: string[]; ranges: PairRange[]; added: string[];
};

export const PICK_DEFAULTS = { sessions: [], conn_types: [], segments: [], rules: [], states: [], ranges: [], added: [] };

/** What the server resolves a node's pick from. */
export const pickQuery = (n: PairNode) => ({ sessions: n.sessions, conn_types: n.conn_types, segments: n.segments, rules: n.rules, states: n.states, ranges: n.ranges });

/** A node's pairs: its pick's, then the ones added by hand. */
export const nodePairs = (s: State, n: PairNode): string[] => [...new Set([...(s.picks[n.id] ?? []), ...n.added])];

/** The one grid a CCG or legend panel is cabled to, which it then sits on; trays of one set share theirs on the first tray. */
export const dockedOn = (s: State, panel: string): string | undefined => {
  const on = s.grids.filter((g) => gridConfig(s, g.id) === panel || gridLegend(s, g.id) === panel);
  if (on.length === 1) return on[0]!.id;
  const set = on[0]?.tray;
  return set && on.every((g) => g.tray === set) ? traysOf(s, on[0]!)[0]!.id : undefined;
};

/** A grid draws with the options of the CCG panel cabled to it, the defaults without one. */
export const optionsOf = (s: State, grid: CcgGrid): CcgOptions => {
  const panel = gridConfig(s, grid.id);
  return panel ? panelCcg(s, panel) : DEFAULT_CCG;
};

export type GridCurve = { label: string; color: string; trace: Trace };

export type GridItem = { key: string; session: string; ref: number; tgt: number; pair: string; ei: "E" | "I"; title: string; color: string; strength: number; on: number; groups: string[]; curves: GridCurve[] };

/** *trace* cut to the lags inside *xlim*. */
export function windowed(trace: Trace, [lo, hi]: [number | null, number | null]): Trace {
  const keep = trace.lags.flatMap((x, i) => (x >= (lo ?? -Infinity) && x <= (hi ?? Infinity) ? [i] : []));
  const cut = <T extends number[] | null | undefined>(ys: T) => (ys && keep.map((i) => ys[i]!)) as T;
  const acgs = trace.acgs && { ref: cut(trace.acgs.ref), tgt: cut(trace.acgs.tgt) };
  return { lags: cut(trace.lags), ccg: cut(trace.ccg), baseline: cut(trace.baseline), p: cut(trace.p), pc: cut(trace.pc), acgs };
}

export const CELL = { w: 2.4, h: 1.4, depth: 1.2, info: 4 };   // cells sit edge to edge

export const colsOf = (grid: CcgGrid) => (grid.list ? 1 : grid.cols);

/** The pairs a tray keeps: its own keys, or all but its `out`. */
export function trayKeys(s: State, grid: CcgGrid): { own: boolean; keys: Set<string> } {
  if (grid.keys) return { own: true, keys: new Set(grid.keys) };
  // first trays saved before copies existed left out whatever their siblings held
  return { own: false, keys: new Set(grid.out ?? s.grids.filter((g) => g.tray && g.tray === grid.tray && g.keys).flatMap((g) => g.keys!)) };
}

/** The trays in a grid's set, the first one first. */
export const traysOf = (s: State, grid: CcgGrid): CcgGrid[] => (grid.tray ? s.grids.filter((g) => g.tray === grid.tray).sort((a, b) => Number(Boolean(a.keys)) - Number(Boolean(b.keys))) : [grid]);


export function sortItems(items: GridItem[], sort: GridSort, sessions: string[]): GridItem[] {
  const order = new Map(sessions.map((s, i) => [s, i]));
  const strong = strongestFirst(items);
  const by: Record<GridSort, (a: GridItem, b: GridItem) => number> = {
    session: (a, b) => (order.get(a.session) ?? 0) - (order.get(b.session) ?? 0) || a.ref - b.ref || a.tgt - b.tgt,
    strength: strong,
    on: (a, b) => b.on - a.on || strong(a, b),
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
  return { w: (grid.list ? CELL.info : 0) + colsOf(grid) * c.w, h: grid.rows * c.h };
}

/** The centre of slot *i* on a page. */
export function slotAt(grid: CcgGrid, n: number, i: number): [number, number] {
  const c = cellSize(grid, n);
  const [col, row] = [i % colsOf(grid), Math.floor(i / colsOf(grid))];
  return [(grid.list ? CELL.info : 0) + col * c.w + c.w / 2, -(row * c.h + c.h / 2)];
}
