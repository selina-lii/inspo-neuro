// CCG grids and pair-filter nodes: add one, change its settings, cable it to a source, remove it.
import { fail, targetPairs } from "./actions";
import { CURVE_DEFAULT, PICK_DEFAULTS, pickQuery, trayKeys, type CcgGrid, type CurveStyle, type PairNode, type StyleNode } from "./core/grid";
import { activeSegment, store, type State } from "./core/store";
import { api } from "./io/api";
import { connect, copyWires, cut, dropPort } from "./wireActions";
import { gridPairs } from "./stackActions";
import { gridSource, idOf, traySet } from "./core/wires";

const newId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const setGrids = (grids: CcgGrid[]) => store.set({ grids });

export const setNodes = (pairNodes: PairNode[]) => store.set({ pairNodes });

export const setStyles = (styleNodes: StyleNode[]) => store.set({ styleNodes });

export const addStyle = () => setStyles([...store.get().styleNodes, { id: `st${Date.now().toString(36)}`, p: [0, 0, 0], q: [0, 0, 0, 1], summon: true, curves: [] }]);

export const patchStyle = (id: string, patch: Partial<StyleNode>) => setStyles(store.get().styleNodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));

export function removeStyle(id: string): void {
  setStyles(store.get().styleNodes.filter((n) => n.id !== id));
  dropPort(`style:${id}`);
}

/** Restyle one segment's curves; a segment not styled yet joins on top, from its colour now. */
export function setCurveStyle(id: string, label: string, color: string, patch: Partial<CurveStyle>): void {
  const { curves } = store.get().styleNodes.find((n) => n.id === id)!;
  const has = curves.some((c) => c.label === label);
  patchStyle(id, { curves: has ? curves.map((c) => (c.label === label ? { ...c, ...patch } : c)) : [...curves, { label, color, ...CURVE_DEFAULT, ...patch }] });
}

/** Move a segment's curves a layer up (+1, over the next) or down (−1); unstyled segments join first, under the styled ones. */
export function layerCurve(id: string, labels: [string, string][], label: string, d: 1 | -1): void {
  const { curves } = store.get().styleNodes.find((n) => n.id === id)!;
  const all = [...labels.filter(([l]) => !curves.some((c) => c.label === l)).map(([l, color]) => ({ label: l, color, ...CURVE_DEFAULT })), ...curves];
  const i = all.findIndex((c) => c.label === label), j = i + d;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j]!, all[i]!];
  patchStyle(id, { curves: all });
}

/** A new grid on the main network's pairs, brought in front of the camera. */
export function addGrid(): void {
  const s = store.get();
  const id = newId();
  setGrids([...s.grids, {
    id, p: [0, 0, 0], q: [0, 0, 0, 1], cols: 4, rows: 3, sort: "strength",
    segMode: "overlay", axis: "x", segments: [activeSegment(s)], pairs: "shown", page: 0, summon: true,
  }]);
  store.set({ wires: [...store.get().wires, { from: "net:main", to: `grid:${id}` }] });
}

export function addNode(): void {
  const { session } = store.get();
  setNodes([...store.get().pairNodes, { id: `n${Date.now().toString(36)}`, p: [0, 0, 0], q: [0, 0, 0, 1], summon: true, ...PICK_DEFAULTS, sessions: session ? [session] : [] }]);
}

/** Resolve a node's pick on the server; a reply for a pick since changed is dropped. */
export async function runPick(id: string): Promise<void> {
  const query = JSON.stringify(pickQuery(store.get().pairNodes.find((n) => n.id === id)!));
  try {
    const { pairs } = await api.pick(JSON.parse(query));
    const node = store.get().pairNodes.find((n) => n.id === id);
    if (node && JSON.stringify(pickQuery(node)) === query) store.set({ picks: { ...store.get().picks, [id]: pairs } });
  } catch (error) {
    fail(error);
  }
}

/** The pairs a hotkey would act on, as keys: picked cards, else the network's selected or focused pairs. */
const targetKeys = () => [...targetPairs()].flatMap(([session, ps]) => ps.map(([r, t]) => `${session}|${r}|${t}`));

export function addToNode(id: string): void {
  const n = store.get().pairNodes.find((x) => x.id === id)!;
  patchNode(id, { added: [...new Set([...n.added, ...targetKeys()])] });
}

export function dropFromNode(id: string): void {
  const gone = new Set(targetKeys());
  patchNode(id, { added: store.get().pairNodes.find((x) => x.id === id)!.added.filter((k) => !gone.has(k)) });
}

/** A copy of a grid, set beside it. */
export function duplicateGrid(id: string): void {
  const g = store.get().grids.find((x) => x.id === id)!;
  const copy = newId();
  setGrids([...store.get().grids, { ...g, tray: undefined, id: copy, p: [g.p[0] + 3, g.p[1] - 3, g.p[2]] }]);
  copyWires(id, copy);
}

/** A tray with *keys* put in it, or taken out. */
function hold(s: State, g: CcgGrid, keys: string[], put: boolean): CcgGrid {
  const t = trayKeys(s, g);
  const next = new Set(t.keys);
  for (const k of keys) put === t.own ? next.add(k) : next.delete(k);
  return t.own ? { ...g, keys: [...next] } : { ...g, out: [...next] };
}

/** Moves or copies pairs from a grid into a tray of its set, a new one beside it when `to` is null. */
export function sendToTray(id: string, keys: string[], to: string | null, copy: boolean): void {
  const s = store.get();
  const g = s.grids.find((x) => x.id === id)!;
  const tray = g.tray ?? g.id;
  const target = to ?? newId();
  const grids = s.grids.map((x) => (x.id === target ? hold(s, x, keys, true) : x.id === id ? { ...(copy ? x : hold(s, x, keys, false)), tray } : x));
  if (!to) grids.push({ ...g, tray, id: target, keys, out: undefined, page: 0, picking: false, p: [g.p[0] + 3, g.p[1] - 3, g.p[2]] });
  setGrids(grids);
  // the new tray shares the set's source; its config, legend and style start as the grid's
  if (!to) copyWires(id, target, ["config", "legend", "style"]);
  store.set({ cells: new Set() });
}

export const patchGrid = (id: string, patch: Partial<CcgGrid>) => setGrids(store.get().grids.map((g) => (g.id === id ? { ...g, ...patch } : g)));

export const patchNode = (id: string, patch: Partial<PairNode>) => setNodes(store.get().pairNodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));

/** Every pair of tray `from` moves into tray `into`, and `from` closes; into the first tray, or from it, the result is the first tray. */
export function mergeTray(from: string, into: string): void {
  const s = store.get();
  const [a, b] = [s.grids.find((g) => g.id === from)!, s.grids.find((g) => g.id === into)!];
  const merged = a.keys ? hold(s, b, a.keys, true) : hold(s, a, b.keys!, true);
  setGrids(s.grids.filter((g) => g.id !== from).map((g) => (g.id === into ? { ...b, keys: merged.keys, out: merged.out } : g)));
}

/** Every grid but *id*: the set's first tray hands what it holds to the next one. */
function without(s: State, id: string): CcgGrid[] {
  const gone = s.grids.find((g) => g.id === id)!;
  const rest = s.grids.filter((g) => g.id !== id);
  const heir = gone.tray && !gone.keys ? rest.find((g) => g.tray === gone.tray) : undefined;
  return rest.map((g) => (g === heir ? { ...g, keys: undefined, out: hold(s, gone, g.keys ?? [], true).out } : g));
}

export function removeGrid(id: string): void {
  const s = store.get();
  const [source, mate] = [gridSource(s, id), traySet(s, id).find((p) => p !== `grid:${id}`)];
  setGrids(without(s, id));
  dropPort(`grid:${id}`);
  // the set's source stays with its other trays
  if (source && mate && !gridSource(store.get(), idOf(mate))) connect(source, mate);
}

/** Grid *b* joins *a*'s tray set: it keeps the pairs it shows and draws from the set's source. */
export function joinTray(a: string, b: string): void {
  const s = store.get();
  const gb = s.grids.find((g) => g.id === b)!;
  const tray = s.grids.find((g) => g.id === a)!.tray ?? a;
  const keys = gridPairs(gb) ?? [];
  const own = gridSource(s, b);
  if (own) cut({ from: own, to: `grid:${b}` });
  setGrids([...without(s, b).map((g) => (g.id === a ? { ...g, tray } : g)), { ...gb, tray, keys, out: undefined }]);
}

export function removeNode(id: string): void {
  setNodes(store.get().pairNodes.filter((n) => n.id !== id));
  dropPort(`node:${id}`);
}

/** A selected cable, by its id "from>to". */
export const cutCable = (id: string) => cut({ from: id.slice(0, id.indexOf(">")), to: id.slice(id.indexOf(">") + 1) });
