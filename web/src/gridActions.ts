// CCG grids and pair-filter nodes: add one, change its settings, cable it to a source, remove it.
import type { CcgGrid, PairNode } from "./core/grid";
import { activeSegment, store } from "./core/store";

export const setGrids = (grids: CcgGrid[]) => store.set({ grids });

export const setNodes = (pairNodes: PairNode[]) => store.set({ pairNodes });

/** A new grid on the main network's pairs, brought in front of the camera. */
export function addGrid(): void {
  const s = store.get();
  setGrids([...s.grids, {
    id: `g${Date.now().toString(36)}`, p: [0, 0, 0], q: [0, 0, 0, 1], source: "net:main", cols: 4, rows: 3, sort: "strength",
    segMode: "overlay", axis: "x", segments: [activeSegment(s)], pairs: "shown", page: 0, summon: true,
  }]);
}

export const addNode = () => setNodes([...store.get().pairNodes, { id: `n${Date.now().toString(36)}`, p: [0, 0, 0], q: [0, 0, 0, 1], source: null, mode: "all", summon: true }]);

/** A copy of a grid, set beside it. */
export function duplicateGrid(id: string): void {
  const g = store.get().grids.find((x) => x.id === id)!;
  setGrids([...store.get().grids, { ...g, id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, p: [g.p[0] + 3, g.p[1] - 3, g.p[2]] }]);
}

export const patchGrid = (id: string, patch: Partial<CcgGrid>) => setGrids(store.get().grids.map((g) => (g.id === id ? { ...g, ...patch } : g)));

export const patchNode = (id: string, patch: Partial<PairNode>) => setNodes(store.get().pairNodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));

export const removeGrid = (id: string) => setGrids(store.get().grids.filter((g) => g.id !== id));

export function removeNode(id: string): void {
  setNodes(store.get().pairNodes.filter((n) => n.id !== id));
  dropSource(`node:${id}`);
}

/** Grids configured by a CCG panel that is gone fall back to the default options. */
export const dropConfig = (panel: string) => setGrids(store.get().grids.map((g) => (g.config === panel ? { ...g, config: null } : g)));

/** Grids and nodes cabled to a port that is gone lose their source. */
export function dropSource(port: string): void {
  setGrids(store.get().grids.map((g) => (g.source === port ? { ...g, source: null } : g)));
  setNodes(store.get().pairNodes.map((n) => (n.source === port ? { ...n, source: null } : n)));
}
