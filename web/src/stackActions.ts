// Ties between stats boards and networks: the cable, the session stack it grows (fetched a layer at a time), row playback.
import { addNetwork, closePanel, fail, removeNetwork, setMainHidden } from "./actions";
import { closeTest, moveBoard, sceneFrame } from "./statsActions";
import { cutCable, removeGrid, removeNode, removeStyle } from "./gridActions";
import { sessionPairs, stackRows, testSessions, type StackLayer, type StackRow, type Tie } from "./core/stack";
import { shownResult, type Quat, type StatsResult, type StatsTest, type Vec3 } from "./core/stats";
import { activeSegment, store, type Picked3 } from "./core/store";
import { nodePairs, trayKeys, type CcgGrid } from "./core/grid";
import { gridSource, netInput } from "./core/wires";
import { api } from "./io/api";
import { undo } from "./history";
import { same3, selection3 } from "./core/select";
import { pointer } from "./ui/galaxy/pointer";

export const setTies = (ties: Tie[]) => store.set({ ties });

/** The workspace's ties whose boards are open; called once its boards are back. */
export function loadTies(saved: Tie[]): void {
  const boards = new Set(store.get().stats.boards.map((b) => b.id));
  // a board stays where it was left: only a new tie places it
  store.set({ ties: saved.filter((t) => boards.has(t.board)).map(({ fresh: _, ...t }) => t) });
  // boards saved on the main network or sharing one each get a network of their own
  const seen = new Set<string>();
  for (const t of store.get().ties) t.network === "main" || seen.has(t.network) ? tie(t.board, t.network) : seen.add(t.network);
}

/** A test shows its result on a network of its own: tied to the main network or one another test holds, it gets a copy of it. */
export function tie(board: string, network: string): void {
  const s = store.get();
  const was = s.ties.find((t) => t.board === board);
  const shared = network === "main" || s.ties.some((t) => t.network === network && t.board !== board);
  const { center, extent } = sceneFrame();
  const own = shared ? addNetwork(network === "main" ? activeSegment(s) : s.networks.find((n) => n.id === network)!.segment, center, extent) : network;
  if (was?.owned && was.network !== own) removeNetwork(was.network);
  setTies([...store.get().ties.filter((t) => t.board !== board), { board, network: own, fresh: true, owned: shared || (was?.owned && was.network === own) }]);
}

/** Boards still being placed on their stacks stay where they are now. */
export const settleTies = (board?: string) => store.get().ties.filter((t) => t.fresh && (!board || t.board === board)).forEach((t) => arranged(t.board));

export function arranged(board: string): void {
  const at = store.get().stats.boards.find((b) => b.id === board)!.pose.p;
  setTies(store.get().ties.map((t) => (t.board === board ? { ...t, fresh: undefined, at } : t)));
}

/** The board alone moves by its title bar: its tie's reference point moves too, so the layers it brought in stay. */
export function slideBoard(board: string, p: Vec3, q: Quat): void {
  const old = store.get().stats.boards.find((b) => b.id === board)!.pose.p;
  moveBoard(board, { p, q });
  setTies(store.get().ties.map((t) => (t.board === board && t.at ? { ...t, at: t.at.map((v, i) => v + p[i]! - old[i]!) as Vec3 } : t)));
}

export function untie(board: string): void {
  const t = store.get().ties.find((x) => x.board === board);
  setTies(store.get().ties.filter((x) => x.board !== board));
  if (t?.owned) removeNetwork(t.network);
  if (store.get().playback?.board === board) stopPlayback();
}

/** What a tied board's stack is built from: its test, the result it shows, the sessions and rows. */
export function stackOf(board: string): { test: StatsTest; result: StatsResult; sessions: string[]; rows: StackRow[] } | null {
  const { stats } = store.get();
  const test = stats.tests.find((t) => t.id === board);
  const b = stats.boards.find((x) => x.id === board);
  const full = test?.results.find((r) => r.resolution === b?.res) ?? test?.results[0];
  if (!test || !full || !stats.options) return null;
  // a row the board hides is gone from all it feeds too
  const result = shownResult(full, b?.hidden);
  return { test, result, sessions: testSessions(result, stats.values), rows: stackRows(result, test.config, stats.options) };
}

/** A grid's own pairs ("session|ref|tgt") when it draws them from a test or a pair node; null from a network. */
export function gridPairs(grid: CcgGrid): string[] | null {
  const s = store.get();
  const [kind, id] = (gridSource(s, grid.id) ?? ":").split(":") as [string, string];
  const st = kind === "board" ? stackOf(id) : null;
  const node = kind === "node" ? s.pairNodes.find((n) => n.id === id) : undefined;
  const all = st ? st.result.rows.flatMap((r) => r.ids.flatMap((v) => s.stats.values[v]?.pair ?? [])) : node ? nodePairs(s, node) : null;
  const tray = trayKeys(s, grid);
  return all && [...new Set(all)].filter((k) => tray.keys.has(k) === tray.own);
}

/** The pairs (ref-tgt) of *session* *network* shows: its input grid's, else those of the tests tied to it; null when neither. */
export function tiedPairs(network: string, session: string): Set<string> | null {
  const input = netInput(store.get(), network);
  const grid = input ? store.get().grids.find((g) => g.id === input) : undefined;
  const fromGrid = grid ? gridPairs(grid) : null;
  if (fromGrid) return new Set(fromGrid.flatMap((k) => (k.startsWith(`${session}|`) ? [k.slice(session.length + 1).replace("|", "-")] : [])));
  const boards = store.get().ties.filter((t) => t.network === network).map((t) => stackOf(t.board)).filter((x) => x !== null);
  return boards.length ? new Set(boards.flatMap((st) => sessionPairs(st.result, store.get().stats.values, session))) : null;
}

let chain: Promise<void> = Promise.resolve();

/** Fetch the layers a tied board needs. */
export function ensureStack(board: string): void {
  const st = stackOf(board);
  if (!st) return;
  const segments = [...new Set(st.rows.flatMap((r) => r.segments))];
  for (const session of st.sessions) ensureLayer(session, segments, sessionPairs(st.result, store.get().stats.values, session), st.result.resolution);
}

const holds = (layer: StackLayer | undefined, segments: string[], pairs: string[], res: string, norms: string): boolean =>
  Boolean(layer) && layer!.res === res && layer!.norms === norms && segments.every((x) => layer!.segs.includes(x)) && pairs.every((x) => layer!.pairs.includes(x));

/** One layer per session holds what every board and grid asked of it, fetched a session at a time (the server holds one session's CCGs at once). */
export function ensureLayer(session: string, segments: string[], pairs: string[], res: string): void {
  const norms = store.get().ccg.norms;
  if (holds(store.get().stack[session], segments, pairs, res, `${norms}`)) return;
  chain = chain.then(async () => {
    const old = store.get().stack[session];
    if (holds(old, segments, pairs, res, `${norms}`)) return;
    // what the layer already held stays, at the same resolution and norms
    const keep = old?.res === res && old.norms === `${norms}`;
    const segs = [...new Set([...(keep ? old.segs : []), ...segments])];
    const all = [...new Set([...(keep ? old.pairs : []), ...pairs])];
    const d = await api.stack(session, segs, all, res, norms);
    const layer: StackLayer = {
      session, neurons: d.neurons, links: d.links.map((l, i) => ({ ...l, i })), shanks: d.shanks, hours: d.hours,
      segLinks: d.seg_links, lags: d.lags ?? [], traces: d.traces, res, norms: `${norms}`, segs, pairs: all,
    };
    store.set({ stack: { ...store.get().stack, [session]: layer } });
  }).catch(fail);
}

let timer = 0;

export function playRows(board: string): void {
  const pb = store.get().playback;
  const ms = pb?.ms ?? 1200;
  store.set({ playback: { board, row: pb?.board === board ? pb.row : 0, playing: true, ms } });
  window.clearInterval(timer);
  timer = window.setInterval(() => stepRow(1), ms);
}

export function pausePlayback(): void {
  window.clearInterval(timer);
  const pb = store.get().playback;
  if (pb) store.set({ playback: { ...pb, playing: false } });
}

export function stopPlayback(): void {
  window.clearInterval(timer);
  store.set({ playback: null });
}

export function stepRow(d: number, board?: string): void {
  const pb = store.get().playback ?? (board ? { board, row: -d, playing: false, ms: 1200 } : null);
  const n = pb && stackOf(pb.board)?.rows.length;
  if (!pb || !n) return;
  store.set({ playback: { ...pb, row: (((pb.row + d) % n) + n) % n } });
}

export function setPlaybackSpeed(ms: number): void {
  const pb = store.get().playback;
  if (!pb) return;
  store.set({ playback: { ...pb, ms } });
  if (pb.playing) playRows(pb.board);
}

/** The picked dot's pair alone, every row's segments, for the card beside its board: no session switch, no full layer. */
export async function loadPickCard(board: string, session: string, ref: number, tgt: number): Promise<void> {
  const st = stackOf(board);
  if (!st) return;
  const segments = [...new Set(st.rows.flatMap((r) => r.segments))];
  const want = `pick|${board}|${session}|${ref}-${tgt}|${segments}|${st.result.resolution}`;
  if (store.get().pickCard?.want === want) return;
  try {
    const d = await api.stack(session, segments, [`${ref}-${tgt}`], st.result.resolution, [], true);
    if (store.get().stats.pick.pair !== `${session}|${ref}|${tgt}`) return;
    store.set({ pickCard: { session, neurons: d.neurons, links: [], shanks: [], hours: d.hours, segLinks: {}, lags: d.lags ?? [], traces: d.traces, res: st.result.resolution, norms: "", segs: segments, pairs: [`${ref}-${tgt}`], want } });
  } catch (error) {
    fail(error);
  }
}

/** Delete whatever is selected in 3D: close a board's test or a panel, close or remove a network, cut a cable. */
export function deletePicked(): void {
  const all = selection3(store.get());
  if (!all.length) return;
  store.set({ picked3: null, more3: [], toast: { text: `Removed ${all.length > 1 ? `${all.length} objects` : all[0]!.kind}`, undo } });
  all.forEach(remove3);
}

/** Remove one object: close a test or panel, hide the open network, remove a copy with its ties, cut a cable. */
export function remove3(p: Picked3): void {
  if (p.kind === "board") closeTest(p.id);
  else if (p.kind === "panel") closePanel(p.id);
  else if (p.kind === "tie") untie(p.id);
  else if (p.kind === "cable") cutCable(p.id);
  else if (p.kind === "node") removeNode(p.id);
  else if (p.kind === "style") removeStyle(p.id);
  else if (p.kind === "grid") removeGrid(p.id);
  else if (p.id === "main") setMainHidden(true);
  else {
    for (const t of store.get().ties.filter((x) => x.network === p.id)) untie(t.board);
    removeNetwork(p.id);
  }
}

/** Select an object in 3D; it stays selected until another is, or Escape; with Shift held it joins or leaves the selection. */
export const pick3 = (kind: Picked3["kind"], id: string) => {
  const s = store.get();
  const p = { kind, id };
  if (pointer.shift && s.picked3) {
    const all = selection3(s);
    const rest = all.some((x) => same3(x, p)) ? all.filter((x) => !same3(x, p)) : [...all, p];
    return void store.set({ picked3: rest[0] ?? null, more3: rest.slice(1), gizmo: false });
  }
  const cur = s.picked3;
  if (cur?.kind !== kind || cur.id !== id) store.set({ picked3: p, more3: [], gizmo: false });
};
