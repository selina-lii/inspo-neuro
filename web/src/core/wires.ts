// Every cable in the space as one directed wire, source port → target port; what a wire does follows from its two ends.
// Grids' sources, configs, legends and styles and networks' inputs are stored here; ties, feeds and the stats editor's
// cable are read from the ties, the fed rows and the active test, which already hold them.
import type { State } from "./store";

/** "kind:id": board, grid, net, node, style or panel. */
export type Port = string;
export type Wire = { from: Port; to: Port };
export type Role = "pairs" | "config" | "legend" | "style" | "input" | "tie" | "feed" | "edit";

const kindOf = (p: Port) => p.slice(0, p.indexOf(":"));
export const idOf = (p: Port) => p.slice(p.indexOf(":") + 1);
const panelKind = (s: State, p: Port) => (kindOf(p) === "panel" ? s.panels.find((x) => x.id === idOf(p))?.kind : undefined);

/** What a wire from *from* to *to* does; null when those two ends do not connect that way round. */
export function roleOf(s: State, from: Port, to: Port): Role | null {
  const [f, t] = [kindOf(from), kindOf(to)];
  if (t === "grid") {
    if (f === "board" || f === "node" || f === "net") return "pairs";
    if (f === "style") return "style";
    if (panelKind(s, from) === "ccg") return "config";
  }
  if (f === "grid") {
    if (t === "board") return "feed";
    if (t === "net" && to !== "net:main") return "input";
    if (panelKind(s, to) === "legend") return "legend";
  }
  if (f === "board" && t === "net") return "tie";
  if (panelKind(s, from) === "stats" && t === "board") return "edit";
  return null;
}

/** Every wire, stored and read off the objects that hold them. */
export function wiresOf(s: State): (Wire & { role: Role })[] {
  const fed = s.stats.tests.flatMap((t) => [...new Set(t.config.rows.flatMap((r) => (r.fed ? [r.fed] : [])))].map((g) => ({ from: `grid:${g}`, to: `board:${t.id}`, role: "feed" as const })));
  return [
    ...s.wires.map((w) => ({ ...w, role: roleOf(s, w.from, w.to)! })).filter((w) => w.role),
    ...s.ties.map((t) => ({ from: `board:${t.board}`, to: `net:${t.network}`, role: "tie" as const })),
    ...fed,
    ...(s.stats.active ? [{ from: "panel:stats", to: `board:${s.stats.active}`, role: "edit" as const }] : []),
  ];
}

/** The port feeding *to* in *role*, if any: every role but feed takes one source. */
export const sourceOf = (s: State, to: Port, role: Role): Port | null => s.wires.find((w) => w.to === to && roleOf(s, w.from, w.to) === role)?.from ?? null;

/** The ports *from* feeds in *role*. */
export const targetsOf = (s: State, from: Port, role: Role): Port[] => wiresOf(s).filter((w) => w.from === from && w.role === role).map((w) => w.to);

/** A grid's pair source port ("board:…", "node:…" or "net:…"), or null. */
export const gridSource = (s: State, grid: string) => sourceOf(s, `grid:${grid}`, "pairs");
/** The CCG panel configuring a grid, by panel id. */
export const gridConfig = (s: State, grid: string) => idOrNull(sourceOf(s, `grid:${grid}`, "config"));
/** The style node styling a grid, by id. */
export const gridStyle = (s: State, grid: string) => idOrNull(sourceOf(s, `grid:${grid}`, "style"));
/** The legend panel a grid keys, by panel id. */
export const gridLegend = (s: State, grid: string) => idOrNull(s.wires.find((w) => w.from === `grid:${grid}` && roleOf(s, w.from, w.to) === "legend")?.to ?? null);
/** The grid a network copy shows the pairs of, by id. */
export const netInput = (s: State, net: string) => idOrNull(sourceOf(s, `net:${net}`, "input"));

const idOrNull = (p: Port | null) => (p ? idOf(p) : null);
