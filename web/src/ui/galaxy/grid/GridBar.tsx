// A CCG grid's float bar: sort, rows × cols, segments overlaid or in series (along x or y), which pairs, pages.
import { sourceOf, type CcgGrid, type GridSort } from "../../../core/grid";
import { patchGrid } from "../../../gridActions";
import { MAIN_SEGMENT } from "../../menu/AddMenu";
import { useStore } from "../../useStore";
import { FloatBar } from "../stats/BoardOverlay";

const SORTS: [GridSort, string][] = [["strength", "by strength"], ["on", "by on segments"], ["session", "by session"], ["ref", "by ref id"]];

export function GridBar({ grid }: { grid: CcgGrid }) {
  const s = useStore();
  const { segments } = s;
  const set = (patch: Partial<CcgGrid>) => patchGrid(grid.id, patch);
  const onNetwork = sourceOf(s, grid)?.startsWith("net:");
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
      {count("rows")}×{count("cols")}
      <span className="sep" />
      <button className={grid.segMode === "overlay" ? "on" : ""} title="one image per pair, a curve per segment or row" onClick={() => set({ segMode: "overlay" })}>overlay</button>
      <button className={grid.segMode === "series" ? "on" : ""} title="one image per segment or row, side by side" onClick={() => set({ segMode: "series" })}>series</button>
      {grid.segMode === "series" && (["x", "y"] as const).map((a) => (
        <button key={a} className={grid.axis === a ? "on" : ""} title={`series along ${a}`} onClick={() => set({ axis: a })}>{a}</button>
      ))}
      <button className={grid.compact ? "on" : ""} title="cells edge to edge, no margins" onClick={() => set({ compact: !grid.compact })}>compact</button>
      {onNetwork && (
        <>
          <span className="sep" />
          <select value={grid.pairs} onChange={(e) => set({ pairs: e.target.value as CcgGrid["pairs"], page: 0 })}>
            <option value="shown">shown pairs</option>
            <option value="selected">selected pairs</option>
          </select>
          {["all", ...segments.map((x) => x.name).filter((x) => MAIN_SEGMENT.test(x))].map((seg) => (
            <button key={seg} className={grid.segments.includes(seg) ? "on" : ""} onClick={() => flip(seg)}>{seg}</button>
          ))}
        </>
      )}
      <span className="sep" />
      <button title="previous page" disabled={grid.page === 0} onClick={() => set({ page: grid.page - 1 })}>◀</button>
      <button title="next page" onClick={() => set({ page: grid.page + 1 })}>▶</button>
    </FloatBar>
  );
}
