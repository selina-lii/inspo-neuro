// CCG grids feeding stats tests: a row per grid segment drawing from the grid's pairs alone, kept in step with the grid.
import { traysOf, type CcgGrid } from "./core/grid";
import { newRow, type RowConfig } from "./core/stats";
import { store } from "./core/store";
import { gridSource, idOf } from "./core/wires";
import { newTest, runTest, setRows } from "./statsActions";
import { stackOf } from "./stackActions";

export const testsFedBy = (grid: string) => store.get().stats.tests.filter((t) => t.config.rows.some((r) => r.fed === grid));

/** What a grid's rows are named after: its tray, else "grid". */
function gridLabel(grid: CcgGrid): string {
  const trays = traysOf(store.get(), grid);
  return trays.length > 1 ? `tray ${trays.indexOf(grid) + 1}` : "grid";
}

/** The grid's curves and the segments each is measured in: a board's rows off a board, else one per grid segment. */
export function gridCurves(grid: CcgGrid): { label: string; segments: string[] }[] {
  const source = gridSource(store.get(), grid.id);
  const st = source?.startsWith("board:") ? stackOf(idOf(source)) : null;
  return st ? st.rows.map((r) => ({ label: r.name, segments: r.segments })) : grid.segments.map((seg) => ({ label: seg, segments: [seg] }));
}

/** A test's rows with a grid's rows in step with its pairs and curves; what was set on a row by hand stays. */
function withGrid(rows: RowConfig[], grid: CcgGrid, keys: string[]): RowConfig[] {
  const options = store.get().stats.options!;
  const sessions = [...new Set(keys.map((k) => k.split("|")[0]!))];
  const mine: RowConfig[] = [];
  for (const c of gridCurves(grid)) {
    const old = rows.find((r) => r.fed === grid.id && (r.curve ? r.curve === c.label : r.segments.join() === c.segments.join()));
    const base = old ?? { ...newRow([...rows, ...mine], options), name: `${gridLabel(grid)} ${c.label}` };
    mine.push({ ...base, sessions, conn_types: options.pickers.ct.items, segments: c.segments, rules: [], follow: null, follow_pickers: [], fed: grid.id, curve: c.label, pairs: [...keys].sort() });
  }
  const at = rows.findIndex((r) => r.fed === grid.id);
  const rest = rows.filter((r) => r.fed !== grid.id);
  return at < 0 ? [...rest, ...mine] : [...rest.slice(0, at), ...mine, ...rest.slice(at)];
}

/** A grid now feeds a test: its first feed replaces the test's own rows. */
export function feedTest(grid: string, test: string): void {
  const t = store.get().stats.tests.find((x) => x.id === test)!;
  const fed = t.config.rows.some((r) => r.fed);
  const g = store.get().grids.find((x) => x.id === grid)!;
  setRows(test, withGrid(fed ? t.config.rows : [], g, []));
}

export function unfeedTest(grid: string, test: string): void {
  setRows(test, store.get().stats.tests.find((x) => x.id === test)!.config.rows.filter((r) => r.fed !== grid));
}

/** The grid's pairs or segments changed: its tests' rows follow, and a result they have is stale. */
export function syncFeeds(grid: CcgGrid, keys: string[]): void {
  for (const t of testsFedBy(grid.id)) {
    const rows = withGrid(t.config.rows, grid, keys);
    if (JSON.stringify(rows) === JSON.stringify(t.config.rows)) continue;
    setRows(t.id, rows);
    if (t.results.length) store.setStats({ tests: store.get().stats.tests.map((x) => (x.id === t.id ? { ...x, stale: true } : x)) });
  }
}

/** A new test fed by the grid, run at once so its board appears. */
export function testFromGrid(grid: CcgGrid, keys: string[]): void {
  newTest();
  const id = store.get().stats.active!;
  setRows(id, withGrid([], grid, keys));
  void runTest(id);
}

