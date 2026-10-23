// Stats-test actions: the editor's edits, runs and saves, the boards in 3D, and picking values on them.
import { fail, focusPair } from "./actions";
import {
  dealFamily, defaultPose, EMPTY_STATS, newRow,
  type Board, type Pose, type RowConfig, type StatsConfig, type StatsPayload, type StatsState, type StatsTest, type Vec3,
} from "./core/stats";
import { store } from "./core/store";
import { statsApi, type RunStatus } from "./io/stats";
import { loadPickCard, tie, untie } from "./stackActions";
import { dropPort, replace } from "./wireActions";
import { FRAME_H, MARGIN, ROW_W } from "./ui/galaxy/stats/boardGeometry";
import type { WorkspaceDoc } from "./workspaceActions";

const POLL_MS = 800;
let seq = 0;
let scene: { center: Vec3; extent: number; height: number } = { center: [0, 0, 0], extent: 16, height: 16 };
let measured = false;
let restoring = false;
export const restoringStats = () => restoring;

const stats = () => store.get().stats;
const testOf = (id: string) => stats().tests.find((t) => t.id === id)!;
const newId = () => `t${Date.now().toString(36)}${seq++}`;

function patchTest(id: string, patch: Partial<StatsTest>): void {
  store.setStats({ tests: stats().tests.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
}

/** The 3D scene tells new boards where the network is, so they open beside it. */
export function noteScene(center: Vec3, extent: number, height: number): void {
  scene = { center, extent, height };
  measured = true;
  // panels never resized by hand join the shared scale, so their titles match the objects around them
  const loose = store.get().panels.some((p) => p.pose && p.pose.s === undefined);
  if (loose) store.set({ panels: store.get().panels.map((p) => (p.pose && p.pose.s === undefined ? { ...p, pose: { ...p.pose, s: newScale() } } : p)) });
  // boards opened before the 3D view first drew are placed once it has measured the network
  if (!stats().boards.some((b) => b.unplaced)) return;
  store.setStats({ boards: stats().boards.reduce<Board[]>((out, b) => [...out, b.unplaced ? { id: b.id, res: b.res, lines: b.lines, pose: newPose(out, rowsOf(b.id)) } : b], []) });
}

/** A new object's own size: a board as tall as the network, and grids at that scale so their titles match. */
export const newScale = () => scene.height / (FRAME_H * store.get().objectScale);

const newPose = (boards: Board[], rows: number) => {
  const half = (Math.max(3, rows * ROW_W) / 2 + MARGIN.left) * newScale() * store.get().objectScale;
  return { ...defaultPose(boards, scene.center.map((v, i) => v + store.get().mainAt[i]!) as Vec3, scene.extent, half), s: newScale() };
};
const rowsOf = (id: string) => testOf(id).results[0]?.rows.length ?? 2;

/** Where the network sits in the scene, for anything else that opens beside it. */
export const sceneFrame = () => scene;

/** The registry holds each value once: whatever no open result shows any more is dropped. */
function pruneValues(tests: StatsTest[], values = stats().values) {
  const used = new Set(tests.flatMap((t) => t.results.flatMap((r) => r.rows.flatMap((row) => row.ids))));
  return Object.fromEntries(Object.entries(values).filter(([id]) => used.has(id)));
}

/** Where a test that replaced another puts its board, once it has one. */
const heirs = new Map<string, Board["pose"]>();

function ensureBoard(id: string, res: string): void {
  const { boards } = stats();
  if (boards.some((b) => b.id === id)) return;
  const pose = heirs.get(id);
  store.setStats({ boards: [...boards, pose ? { id, res, pose } : { id, res, pose: newPose(boards, rowsOf(id)), ...(measured ? {} : { unplaced: true }) }] });
}

function withPayload(id: string, payload: StatsPayload, patch: Partial<StatsTest>): void {
  const warnings = [
    ...Object.entries(payload.missing).map(([seg, ss]) => `${seg}: no CCG for ${ss.join(", ")}, left out`),
    ...payload.tail_fallbacks.map((r) => `${r[2]} ${r[0]} ${r[1]}: tail baseline fell back to the native window for ${r[3]} of ${r[4]} pairs`),
  ];
  const tests = stats().tests.map((t) => (t.id === id ? { ...t, ...patch, status: "done" as const, stale: false, error: "", text: payload.text, results: payload.results, warnings } : t));
  store.setStats({ tests, values: pruneValues(tests, { ...stats().values, ...payload.values }) });
  ensureBoard(id, payload.results[0]?.resolution ?? "lowres");
}

export async function loadStats(ws: WorkspaceDoc): Promise<void> {
  restoring = true;
  try {
    const [options, { saved }] = await Promise.all([statsApi.options(), statsApi.saved()]);
    // a test whose file is missing keeps its name, so the workspace finds the file again once it is back
    const onDisk = new Set(saved.map((x) => x.name));
    const tests = ws.tests.map((t) => blank(t.id, t.name, t.config));
    store.setStats({ ...EMPTY_STATS, options, saved, tests, active: tests[0]?.id ?? null });
    await Promise.all(tests.filter((t) => onDisk.has(t.name)).map(async (t) => withPayload(t.id, await statsApi.load(t.name), {})));
    const ids = new Set(stats().tests.map((t) => t.id));
    const fresh = stats().boards.filter((b) => !ws.boards.some((w) => w.id === b.id));
    store.setStats({ boards: [...ws.boards.filter((b) => ids.has(b.id)), ...fresh] });
  } catch (error) {
    fail(error);
  } finally {
    restoring = false;
  }
}

const blank = (id: string, name: string, config: StatsConfig): StatsTest =>
  ({ id, name, config, job: null, status: "idle", error: "", text: "", results: [], warnings: [] });

export function newTest(id = newId()): void {
  const { options, tests } = stats();
  if (!options) return;
  const session = store.get().session;
  let rows: RowConfig[] = [];
  for (let i = 0; i < 2; i++) rows = [...rows, { ...newRow(rows, options), sessions: session ? [session] : [] }];
  store.setStats({ tests: [...tests, blank(id, "", { rows, test: options.defaults.test, view: options.defaults.view, display: null })], active: id });
}

/** `withNetworks`: only the Add menu's "bring in its networks" ties a test to the main network. */
export async function openSaved(name: string, withNetworks = false, id = newId()): Promise<void> {
  try {
    const loaded = await statsApi.load(name);
    store.setStats({ tests: [...stats().tests, blank(id, stats().tests.some((t) => t.name === name) ? "" : name, loaded.config)], active: id });
    withPayload(id, loaded, {});
    if (withNetworks && loaded.results.length) tie(id, "main");
  } catch (error) {
    fail(error);
  }
}

/** Like replacing an image: a new or saved test takes over a test's board place and cables, and the old one closes. */
export async function replaceTest(old: string, open: (id: string) => unknown): Promise<void> {
  const id = newId();
  const pose = stats().boards.find((b) => b.id === old)?.pose;
  if (pose) heirs.set(id, pose);
  await open(id);
  if (!stats().tests.some((t) => t.id === id)) return;
  replace(`board:${old}`, `board:${id}`);
  closeTest(old);
  setActiveTest(id);
}

/** An independent copy of a test, unsaved, with its result; its board a little to the right of the original's. */
export function duplicateTest(id: string): void {
  const copy = newId();
  const board = stats().boards.find((b) => b.id === id)!;
  const [x, y, z] = board.pose.p;
  store.setStats({
    tests: [...stats().tests, { ...testOf(id), id: copy, name: "" }],
    boards: [...stats().boards, { ...board, id: copy, pose: { ...board.pose, p: [x + 3, y - 3, z] } }],
    active: copy,
  });
}

export function closeTest(id: string): void {
  untie(id);
  dropPort(`board:${id}`);
  const tests = stats().tests.filter((t) => t.id !== id);
  store.setStats({ tests, boards: stats().boards.filter((b) => b.id !== id), values: pruneValues(tests), active: tests[0]?.id ?? null });
}

export const setActiveTest = (id: string) => store.setStats({ active: id });

export function updateConfig(id: string, patch: Partial<StatsConfig>): void {
  patchTest(id, { config: { ...testOf(id).config, ...patch } });
}

export const setRows = (id: string, rows: RowConfig[]) => updateConfig(id, { rows });

export function pickFamily(id: string, at: number, family: string): void {
  const { options } = stats();
  setRows(id, dealFamily(testOf(id).config.rows, at, options!.families[family]!, options!));
}

export async function runTest(id: string): Promise<void> {
  patchTest(id, { status: "running", error: "", text: "Running…" });
  try {
    const { job } = await statsApi.run(testOf(id).config);
    let st: RunStatus = await statsApi.status(job);
    while (st.status === "running") {
      await new Promise((r) => window.setTimeout(r, POLL_MS));
      st = await statsApi.status(job);
    }
    if (st.status === "error") return patchTest(id, { status: "error", error: st.error, text: "" });
    // the run drew its thinning seed: keep it, so saving reproduces this sample
    withPayload(id, st, { job, config: { ...testOf(id).config, test: st.config.test } });
  } catch (error) {
    patchTest(id, { status: "error", error: error instanceof Error ? error.message : String(error), text: "" });
  }
}

export async function saveTest(id: string, name: string): Promise<void> {
  const t = testOf(id);
  try {
    await statsApi.save(name, t.job!);
    patchTest(id, { name });
    store.setStats({ saved: (await statsApi.saved()).saved });
    store.set({ toast: { text: `Saved stats result ${name}` } });
  } catch (error) {
    fail(error);
  }
}

function patchBoard(id: string, patch: Partial<Board>): void {
  store.setStats({ boards: stats().boards.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
}

/** Flip a board's resolution; a pick on it moves to the same pair's values at the new resolution. */
export function setBoardRes(id: string, res: string): void {
  patchBoard(id, { res });
  const { pick, values } = stats();
  const old = [...pick.ids].map((k) => values[k]!).filter((v) => v.res !== res);
  const next = Object.keys(values).find((k) => {
    const v = values[k]!;
    return v.pair === pick.pair && v.res === res && old.some((o) => o.row === v.row && o.metric === v.metric);
  });
  if (next) pickValue(next, pick.lineage, id);
}
export const moveBoard = (id: string, pose: Pose) => patchBoard(id, { pose: { ...pose, s: stats().boards.find((b) => b.id === id)?.pose.s } });

export const resizeBoard = (id: string, s: number) => {
  const board = stats().boards.find((b) => b.id === id);
  if (board) patchBoard(id, { pose: { ...board.pose, s } });
};

/** Click: that value, everywhere it is drawn. Double-click: every value of its pair. Its pair's CCGs open beside the board
 * (or on its layer, on a tied board); the session in view never switches. */
export async function pickValue(id: string, lineage: boolean, board: string): Promise<void> {
  const v = stats().values[id]!;
  const ids = lineage ? Object.keys(stats().values).filter((k) => stats().values[k]!.pair === v.pair) : [id];
  store.setStats({ pick: { ids: new Set(ids), pair: v.pair, lineage } });
  // the pair's card beside the board shows every row at once; the network only focuses a pair of its own session
  if (!store.get().ties.some((t) => t.board === board)) loadPickCard(board, v.session, v.ref, v.tgt);
  if (store.get().session !== v.session) return;
  focusPair(v.ref, v.tgt);
}

/** A link clicked on a tied layer: its pair on the board, every row it is in. */
export function pickPair(board: string, session: string, ref: number, tgt: number): void {
  const pair = `${session}|${ref}|${tgt}`;
  const id = Object.keys(stats().values).find((k) => stats().values[k]!.pair === pair);
  if (id) pickValue(id, true, board);
}

export const setBoardLines = (id: string, lines: Board["lines"]) => patchBoard(id, { lines });
export const setBoardHidden = (id: string, hidden: string[]) => patchBoard(id, { hidden });

export const hoverValue = (hover: StatsState["hover"]) => store.setStats({ hover });

export const clearPick = () => (store.setStats({ pick: { ids: new Set(), pair: null, lineage: false } }), store.set({ pickCard: null }));
