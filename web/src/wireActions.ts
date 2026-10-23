// Cabling: a drag from one port to another becomes the wire its ends allow; cutting one undoes what it did.
import { roleOf, wiresOf, type Port, type Role, type Wire } from "./core/wires";
import { store } from "./core/store";
import { feedTest, unfeedTest } from "./feedActions";
import { setActiveTest } from "./statsActions";
import { setTies, tie, untie } from "./stackActions";

const setWires = (wires: Wire[]) => store.set({ wires });
const ends = (w: Wire) => [w.from, w.to];
const SHARED: Role[] = ["pairs", "config", "legend", "style"];

/** The wire a drag from *a* to *b* makes: that way round if its ends allow it, else the other way. */
export function connect(a: Port, b: Port): void {
  const s = store.get();
  const [from, to] = roleOf(s, a, b) ? [a, b] : [b, a];
  const role = roleOf(s, from, to);
  if (!role) return;
  if (role === "tie") return tie(from.slice(6), to.slice(4));
  if (role === "feed") return feedTest(from.slice(5), to.slice(6));
  if (role === "edit") return setActiveTest(to.slice(6));
  // a legend keys one grid's curves; every other stored role takes one source per target
  const same = (w: Wire) => roleOf(s, w.from, w.to) === role && (role === "legend" ? w.from === from : w.to === to);
  setWires([...s.wires.filter((w) => !same(w)), { from, to }]);
}

export function cut(w: Wire): void {
  const role = roleOf(store.get(), w.from, w.to);
  if (role === "tie") return untie(w.from.slice(6));
  if (role === "feed") return unfeedTest(w.from.slice(5), w.to.slice(6));
  setWires(store.get().wires.filter((x) => x.from !== w.from || x.to !== w.to));
}

/** *by* takes every cable at *old*, which keeps none. */
export function replace(old: Port, by: Port): void {
  const swap = (p: Port) => (p === old ? by : p);
  // a tie moves as it is: untying first would drop the network it owns
  setTies(store.get().ties.filter((t) => `board:${t.board}` !== by).map((t) => (`board:${t.board}` === old ? { ...t, board: by.slice(6) } : t)));
  for (const w of wiresOf(store.get()).filter((x) => x.role !== "tie" && ends(x).includes(old))) {
    cut(w);
    connect(swap(w.from), swap(w.to));
  }
}

/** An object gone: every stored wire at its port goes with it. */
export const dropPort = (port: Port) => setWires(store.get().wires.filter((w) => !ends(w).includes(port)));

/** A new grid takes the stored wires of *grid*: a tray shares its set's source, config, legend and style. */
export function copyWires(grid: string, to: string): void {
  const s = store.get();
  const [old, now] = [`grid:${grid}`, `grid:${to}`];
  const copies = s.wires.filter((w) => ends(w).includes(old) && SHARED.includes(roleOf(s, w.from, w.to)!))
    .map((w) => ({ from: w.from === old ? now : w.from, to: w.to === old ? now : w.to }));
  setWires([...s.wires, ...copies]);
}

type Legacy = { id: string; source?: string | null; config?: string | null; legend?: string | null; style?: string | null };

/** Wires from a workspace saved before them: each grid's source, config, legend and style, each network copy's input. */
export function legacyWires(grids: Legacy[], inputs: { id: string; input?: string | null }[]): Wire[] {
  return [
    ...grids.flatMap((g) => [
      ...(g.source ? [{ from: g.source, to: `grid:${g.id}` }] : []),
      ...(g.config ? [{ from: `panel:${g.config}`, to: `grid:${g.id}` }] : []),
      ...(g.style ? [{ from: `style:${g.style}`, to: `grid:${g.id}` }] : []),
      ...(g.legend ? [{ from: `grid:${g.id}`, to: `panel:${g.legend}` }] : []),
    ]),
    ...inputs.flatMap((n) => (n.input ? [{ from: `grid:${n.input}`, to: `net:${n.id}` }] : [])),
  ];
}
