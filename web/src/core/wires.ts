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

/** The other end of the stored wire at *port* in *role*: a grid's source, config, style or legend, a network's input. */
function endOf(s: State, port: Port, role: Role): Port | null {
  const w = s.wires.find((x) => (x.to === port || x.from === port) && roleOf(s, x.from, x.to) === role);
  return w ? (w.to === port ? w.from : w.to) : null;
}
const endId = (s: State, port: Port, role: Role) => {
  const end = endOf(s, port, role);
  return end && idOf(end);
};

/** A grid's pair source port ("board:…", "node:…" or "net:…"), or null. */
export const gridSource = (s: State, grid: string) => endOf(s, `grid:${grid}`, "pairs");
export const gridConfig = (s: State, grid: string) => endId(s, `grid:${grid}`, "config");
export const gridStyle = (s: State, grid: string) => endId(s, `grid:${grid}`, "style");
export const gridLegend = (s: State, grid: string) => endId(s, `grid:${grid}`, "legend");
export const netInput = (s: State, net: string) => endId(s, `net:${net}`, "input");
