// CCG grids and pair-filter nodes: add one, change its settings, cable it to a source, remove it.
import { fail, targetPairs } from "./actions";
import { CURVE_DEFAULT, PICK_DEFAULTS, pickQuery, type CcgGrid, type CurveStyle, type PairNode, type StyleNode } from "./core/grid";
import { activeSegment, store } from "./core/store";
import { api } from "./io/api";

export const setGrids = (grids: CcgGrid[]) => store.set({ grids });

export const setNodes = (pairNodes: PairNode[]) => store.set({ pairNodes });

export const setStyles = (styleNodes: StyleNode[]) => store.set({ styleNodes });

export const addStyle = () => setStyles([...store.get().styleNodes, { id: `st${Date.now().toString(36)}`, p: [0, 0, 0], q: [0, 0, 0, 1], summon: true, curves: [] }]);

export const patchStyle = (id: string, patch: Partial<StyleNode>) => setStyles(store.get().styleNodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));

export function removeStyle(id: string): void {
  setStyles(store.get().styleNodes.filter((n) => n.id !== id));
  setGrids(store.get().grids.map((g) => (g.style === id ? { ...g, style: null } : g)));
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
  setGrids([...s.grids, {
    id: `g${Date.now().toString(36)}`, p: [0, 0, 0], q: [0, 0, 0, 1], source: "net:main", cols: 4, rows: 3, sort: "strength",
    segMode: "overlay", axis: "x", segments: [activeSegment(s)], pairs: "shown", page: 0, summon: true,
  }]);
}

export const addNode = () => setNodes([...store.get().pairNodes, { id: `n${Date.now().toString(36)}`, p: [0, 0, 0], q: [0, 0, 0, 1], summon: true, ...PICK_DEFAULTS }]);

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
  setGrids([...store.get().grids, { ...g, tray: undefined, id: newId(), p: [g.p[0] + 3, g.p[1] - 3, g.p[2]] }]);
}

const newId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Moves pairs from a grid into a tray of its set, a new one beside it when `to` is null. */
export function moveToTray(id: string, keys: string[], to: string | null): void {
  const s = store.get();
  const g = s.grids.find((x) => x.id === id)!;
  const tray = g.tray ?? g.id;
  const target = to ?? newId();
  const moved = new Set(keys);
  const grids = s.grids.map((x) => {
    const y = x.id === id ? { ...x, tray } : x;
    if (y.tray !== tray || !y.keys) return y;
    return { ...y, keys: y.id === target ? [...new Set([...y.keys, ...keys])] : y.keys.filter((k) => !moved.has(k)) };
  });
  if (!to) grids.push({ ...g, tray, id: target, keys, page: 0, picking: false, p: [g.p[0] + 3, g.p[1] - 3, g.p[2]] });
  setGrids(grids);
  store.set({ cells: new Set() });
}

export const patchGrid = (id: string, patch: Partial<CcgGrid>) => setGrids(store.get().grids.map((g) => (g.id === id ? { ...g, ...patch } : g)));

export const patchNode = (id: string, patch: Partial<PairNode>) => setNodes(store.get().pairNodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));

/** Every pair of tray `from` moves into tray `into`, and `from` closes; into the first tray, or from it, the result is the first tray. */
export function mergeTray(from: string, into: string): void {
  const grids = store.get().grids;
  const [a, b] = [grids.find((g) => g.id === from)!, grids.find((g) => g.id === into)!];
  const keys = a.keys && b.keys ? [...new Set([...b.keys, ...a.keys])] : undefined;
  setGrids(grids.filter((g) => g.id !== from).map((g) => (g.id === into ? { ...g, keys } : g)));
}

export function removeGrid(id: string): void {
  const gone = store.get().grids.find((g) => g.id === id)!;
  const rest = store.get().grids.filter((g) => g.id !== id);
  // the set's first tray hands the pairs no other tray holds to the next one
  const heir = gone.tray && !gone.keys ? rest.find((g) => g.tray === gone.tray) : undefined;
  setGrids(rest.map((g) => (g === heir ? { ...g, keys: undefined } : g)));
}

export function removeNode(id: string): void {
  setNodes(store.get().pairNodes.filter((n) => n.id !== id));
  dropSource(`node:${id}`);
}

/** Grids configured or keyed by a panel that is gone fall back to the default options and their own keys. */
export const dropConfig = (panel: string) => setGrids(store.get().grids.map((g) => ({ ...g, config: g.config === panel ? null : g.config, legend: g.legend === panel ? null : g.legend })));

/** Grids cabled to a port that is gone lose their source. */
export const dropSource = (port: string) => setGrids(store.get().grids.map((g) => (g.source === port ? { ...g, source: null } : g)));
