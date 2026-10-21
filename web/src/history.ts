// Undo / redo for the space's arrangement: objects, poses, ties, panels, open tests. Steps hold references to the store's
// immutable slices, not copies, so a step costs a few pointers whatever it removed.
import { setMainHidden, setNetworks } from "./actions";
import { store, type State } from "./core/store";
import { setGrids } from "./gridActions";
import { setTies } from "./stackActions";
import { restoringStats } from "./statsActions";

type Snap = Pick<State, "networks" | "grids" | "ties" | "panels" | "mainHidden" | "mainAt"> & { tests: State["stats"]["tests"]; boards: State["stats"]["boards"]; values: State["stats"]["values"] };
// edits that live on the server (tags, pair states) are steps that know their own inverse
type Act = { undo(): void; redo(): void };
type Step = Snap | Act;
const isAct = (x: Step): x is Act => "undo" in x;

const LIMIT = 200;
const QUIET_MS = 500;   // changes this close together (a drag, a carry) are one step

const snap = (s: State): Snap => ({
  networks: s.networks, grids: s.grids, ties: s.ties, panels: s.panels, mainHidden: s.mainHidden, mainAt: s.mainAt, tests: s.stats.tests, boards: s.stats.boards, values: s.stats.values,
});
const same = (a: Snap, b: Snap) => (Object.keys(a) as (keyof Snap)[]).every((k) => a[k] === b[k]);

let undos: Step[] = [];
let redos: Step[] = [];
let base = snap(store.get());
let where = "";
let quiet = 0;
let applying = false;

store.subscribe(() => {
  const s = store.get();
  const now = snap(s);
  // another project or session is another space: its history starts over
  const at = `${s.project}|${s.session}`;
  if (at !== where || restoringStats() || s.busy) {
    [where, base, undos, redos] = [at, now, at !== where ? [] : undos, at !== where ? [] : redos];
    return;
  }
  if (applying || same(now, base)) return;
  if (!quiet) {
    undos = [...undos.slice(-LIMIT + 1), base];
    redos = [];
  }
  window.clearTimeout(quiet);
  quiet = window.setTimeout(() => void (quiet = 0), QUIET_MS);
  base = now;
});

function apply(step: Snap): void {
  applying = true;
  window.clearTimeout(quiet);
  quiet = 0;
  setNetworks(step.networks);
  setGrids(step.grids);
  setTies(step.ties);
  setMainHidden(step.mainHidden);
  store.set({ panels: step.panels, mainAt: step.mainAt, picked3: null });
  store.setStats({ tests: step.tests, boards: step.boards, values: step.values });
  base = snap(store.get());
  applying = false;
}

/** Put a server edit on the stack, after whatever arrangement change came before it. */
export function record(act: Act): void {
  window.clearTimeout(quiet);
  quiet = 0;
  undos = [...undos.slice(-LIMIT + 1), act];
  redos = [];
}

export function undo(): void {
  const step = undos.pop();
  if (!step) return;
  if (isAct(step)) return void (redos.push(step), step.undo());
  redos.push(base);
  apply(step);
}

export function redo(): void {
  const step = redos.pop();
  if (!step) return;
  if (isAct(step)) return void (undos.push(step), step.redo());
  undos.push(base);
  apply(step);
}
