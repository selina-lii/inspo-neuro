// A CCG grid's float bar: sort, rows × cols, segments overlaid or in series (along x or y), which pairs, pages.
import { movePairs, targetPairs, toggleGroup } from "../../../actions";
import { realGroups } from "../../../core/colors";
import { colsOf, type CcgGrid, type GridSort } from "../../../core/grid";
import { store } from "../../../core/store";
import { patchGrid } from "../../../gridActions";
import { useGridItems } from "./gridItems";
import { MAIN_SEGMENT } from "../../menu/AddMenu";
import { useStore } from "../../useStore";
import { FloatBar } from "../stats/BoardOverlay";

const SORTS: [GridSort, string][] = [["strength", "by strength"], ["on", "by on segments"], ["session", "by session"], ["ref", "by ref id"]];

export function GridBar({ grid }: { grid: CcgGrid }) {
  const s = useStore();
  const { segments } = s;
  const set = (patch: Partial<CcgGrid>) => patchGrid(grid.id, patch);
  const onNetwork = grid.source?.startsWith("net:");
  const bySegment = onNetwork || grid.source?.startsWith("node:");
  const flip = (seg: string) => {
    const next = grid.segments.includes(seg) ? grid.segments.filter((x) => x !== seg) : [...grid.segments, seg];
    if (next.length) set({ segments: next });
  };
  const count = (k: "cols" | "rows") => (
    <input type="number" min={1} value={grid[k]} title={k === "cols" ? "columns" : "rows"} style={{ width: 38 }}
      onChange={(e) => e.target.value && set({ [k]: Math.max(1, Math.round(Number(e.target.value))), page: 0 })} />
  );
  return (
    <FloatBar id={`grid:${grid.id}`}>
      <select value={grid.sort} onChange={(e) => set({ sort: e.target.value as GridSort, page: 0 })}>
        {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
      <span className="sep" />
      {count("rows")}{!grid.list && <>×{count("cols")}</>}
      <button className={grid.list ? "on" : ""} title="one column, an info line beside each pair" onClick={() => set({ list: !grid.list, page: 0 })}>list</button>
      <span className="sep" />
      <button className={grid.segMode === "overlay" ? "on" : ""} title="one image per pair, a curve per segment or row" onClick={() => set({ segMode: "overlay" })}>overlay</button>
      <button className={grid.segMode === "series" ? "on" : ""} title="one image per segment or row, side by side" onClick={() => set({ segMode: "series" })}>series</button>
      {grid.segMode === "series" && (["x", "y"] as const).map((a) => (
        <button key={a} className={grid.axis === a ? "on" : ""} title={`series along ${a}`} onClick={() => set({ axis: a })}>{a}</button>
      ))}
      <button className={grid.compact ? "on" : ""} title="cells edge to edge, no margins" onClick={() => set({ compact: !grid.compact })}>compact</button>
      {bySegment && (
        <>
          <span className="sep" />
          {onNetwork && (
            <select value={grid.pairs} onChange={(e) => set({ pairs: e.target.value as CcgGrid["pairs"], page: 0 })}>
              <option value="shown">shown pairs</option>
              <option value="selected">selected pairs</option>
            </select>
          )}
          {["all", ...segments.map((x) => x.name).filter((x) => MAIN_SEGMENT.test(x))].map((seg) => (
            <button key={seg} className={grid.segments.includes(seg) ? "on" : ""} onClick={() => flip(seg)}>{seg}</button>
          ))}
        </>
      )}
      <span className="sep" />
      <button title="previous page" disabled={grid.page === 0} onClick={() => set({ page: grid.page - 1 })}>◀</button>
      <button title="next page" onClick={() => set({ page: grid.page + 1 })}>▶</button>
      <span className="sep" />
      <button className={grid.picking ? "on" : ""} title="click cards to pick them, drag across cards to pick a run" onClick={() => set({ picking: !grid.picking })}>select</button>
      <Picked grid={grid} />
    </FloatBar>
  );
}

/** While cards are picked: how many, pick a page or all or none, tag them, move them. */
function Picked({ grid }: { grid: CcgGrid }) {
  const s = useStore();
  const keys = useGridItems(grid).map((x) => x.key);
  if (!keys.some((k) => s.cells.has(k)) && !grid.picking) return null;
  const per = colsOf(grid) * grid.rows;
  const add = (more: string[]) => store.set({ cells: new Set([...s.cells, ...more]) });
  const states = [["S", "sel", "selected"], ["U", "unsel", "unselected"], ["D", "del", "deleted"]] as const;
  return (
    <>
      <span className="muted">{s.cells.size} picked</span>
      <button title="pick every card on this page" onClick={() => add(keys.slice(grid.page * per, (grid.page + 1) * per))}>page</button>
      <button title="pick every card in the grid" onClick={() => add(keys)}>all</button>
      <button title="pick none" disabled={!s.cells.size} onClick={() => store.set({ cells: new Set() })}>none</button>
      <span className="sep" />
      <select value="" disabled={!s.cells.size} title="tag the picked pairs, or untag them when all are in" onChange={(e) => e.target.value && toggleGroup(e.target.value)}>
        <option value="">tag…</option>
        {realGroups(s.pairGroups).map((g) => <option key={g} value={g}>{g}{s.groupMeta[g]?.hotkey ? ` (${s.groupMeta[g]!.hotkey})` : ""}</option>)}
      </select>
      {states.map(([k, st, label]) => (
        <button key={k} disabled={!s.cells.size} title={`move the picked pairs to ${label} (Shift ${k})`} onClick={() => movePairs(targetPairs(), st)}>{k}</button>
      ))}
    </>
  );
}
