// Named workspaces: a project's space as arranged (open tests, boards, grids, ties, panels, network copies), a file each on the server, saved as it changes.
import { fail, openSession, panelsFrom } from "./actions";
import { PICK_DEFAULTS, type CcgGrid, type PairNode, type StyleNode } from "./core/grid";
import type { Tie } from "./core/stack";
import type { Board, StatsConfig } from "./core/stats";
import { store, type NetworkCopy, type SpacePanel } from "./core/store";
import { api } from "./io/api";
import { loadTies } from "./stackActions";
import { loadStats } from "./statsActions";

export type WorkspaceDoc = {
  tests: { id: string; name: string; config: StatsConfig }[]; boards: Board[]; session?: string;
  grids?: CcgGrid[]; pairNodes?: PairNode[]; styleNodes?: StyleNode[]; ties?: Tie[]; panels?: SpacePanel[];
  networks?: Record<string, NetworkCopy[]>; mainHidden?: Record<string, boolean>;
  mainAt?: Record<string, [number, number, number]>;
};

let doc: WorkspaceDoc = { tests: [], boards: [] };
let loading = false;
let timer = 0;
let pending: (() => void) | null = null;
let refs: unknown[] = [];

// the stats workspace this replaced carries only tests and boards: the rest was kept in this browser
function legacy<T>(key: string, fallback: T): T {
  if (doc.grids) return fallback;
  try {
    return (JSON.parse(window.localStorage.getItem(`neuromap:${key}`) ?? "null") as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

export const networksOf = (session: string): NetworkCopy[] => doc.networks?.[session] ?? legacy(`networks:${store.get().project}:${session}`, []);
export const mainAtOf = (session: string): [number, number, number] => doc.mainAt?.[session] ?? [0, 0, 0];
export const mainHiddenOf = (session: string): boolean => doc.mainHidden?.[session] ?? legacy(`mainHidden:${store.get().project}:${session}`, false);

const watched = () => {
  const s = store.get();
  return [s.workspace, s.session, s.stats.tests, s.stats.boards, s.grids, s.pairNodes, s.styleNodes, s.ties, s.panels, s.networks, s.mainHidden, s.mainAt];
};

function flush(): void {
  window.clearTimeout(timer);
  pending?.();
  pending = null;
}

store.subscribe(() => {
  const s = store.get();
  const now = watched();
  if (loading || !s.workspace || !s.session || now.every((x, i) => x === refs[i])) return;
  refs = now;
  doc = {
    session: s.session, tests: s.stats.tests.map((t) => ({ id: t.id, name: t.name, config: t.config })), boards: s.stats.boards,
    grids: s.grids, pairNodes: s.pairNodes, styleNodes: s.styleNodes, ties: s.ties, panels: s.panels,
    networks: { ...doc.networks, [s.session]: s.networks }, mainHidden: { ...doc.mainHidden, [s.session]: s.mainHidden },
    mainAt: { ...doc.mainAt, [s.session]: s.mainAt },
  };
  const [name, body] = [s.workspace, doc];
  window.clearTimeout(timer);
  pending = () => void api.saveWorkspace(name, body).catch(fail);
  timer = window.setTimeout(flush, 600);
});

export async function openWorkspace(name: string): Promise<void> {
  flush();
  loading = true;
  try {
    doc = await api.workspace(name);
    const { sessions, project } = store.get();
    store.set({
      workspace: name, picked3: null, panels: panelsFrom(doc.panels ?? legacy("panels", undefined)),
      grids: doc.grids ?? legacy(`grids:${project}`, []),
      // nodes saved as filters of another source take a pick's fields
      pairNodes: (doc.pairNodes ?? legacy(`pairNodes:${project}`, [])).map((n) => ({ ...PICK_DEFAULTS, ...n })), picks: {}, styleNodes: doc.styleNodes ?? [],
    });
    await openSession(doc.session && sessions.includes(doc.session) ? doc.session : sessions[0]!);
    await loadStats(doc);
    loadTies(doc.ties ?? legacy(`ties:${project}`, []));
  } catch (error) {
    fail(error);
  } finally {
    loading = false;
    refs = watched();
  }
}

/** An empty workspace, "untitled N", opened on the project's first session. */
export async function newWorkspace(): Promise<void> {
  const taken = new Set(store.get().workspaces);
  let n = 1;
  while (taken.has(`untitled ${n}`)) n++;
  const name = `untitled ${n}`;
  await api.saveWorkspace(name, { tests: [], boards: [], grids: [], pairNodes: [], ties: [], networks: {}, mainHidden: {} });
  store.set({ workspaces: [name, ...store.get().workspaces] });
  await openWorkspace(name);
}

/** The names on disk now: another tab or a cleanup may have changed them. */
export async function refreshWorkspaces(): Promise<void> {
  store.set({ workspaces: (await api.workspaces()).names });
}

export async function renameWorkspace(to: string): Promise<void> {
  const from = store.get().workspace!;
  flush();
  try {
    await api.renameWorkspace(from, to);
    store.set({ workspace: to, workspaces: store.get().workspaces.map((x) => (x === from ? to : x)) });
  } catch (error) {
    fail(error);
  }
}

/** Delete a workspace (the server keeps a backup); deleting the open one opens the next, or a new one. */
export async function deleteWorkspace(name: string): Promise<void> {
  if (name === store.get().workspace) [pending, refs] = [null, watched()];
  try {
    await api.deleteWorkspace(name);
    const rest = store.get().workspaces.filter((x) => x !== name);
    store.set({ workspaces: rest });
    if (name === store.get().workspace) await (rest[0] ? openWorkspace(rest[0]) : newWorkspace());
  } catch (error) {
    fail(error);
  }
}
