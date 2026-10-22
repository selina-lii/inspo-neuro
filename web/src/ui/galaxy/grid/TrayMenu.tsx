// A grid's trays in its right-click menu: move the picked cards to another tray, tag every pair in this one.
import { keyedPairs, toggleGroup } from "../../../actions";
import { realGroups } from "../../../core/colors";
import { traysOf, type CcgGrid } from "../../../core/grid";
import { moveToTray } from "../../../gridActions";
import { useStore } from "../../useStore";
import { useGridItems } from "./gridItems";

export function TrayMenu({ grid, act }: { grid: CcgGrid; act: (f: () => void) => () => void }) {
  const s = useStore();
  const keys = useGridItems(grid).map((x) => x.key);
  const picked = keys.filter((k) => s.cells.has(k));
  const trays = traysOf(s, grid);
  return (
    <>
      {picked.length > 0 && (
        <>
          <button onClick={act(() => moveToTray(grid.id, picked, null))}>move {picked.length} picked to a new tray</button>
          {trays.map((t, i) => t.id !== grid.id && <button key={t.id} onClick={act(() => moveToTray(grid.id, picked, t.id))}>move {picked.length} picked to tray {i + 1}</button>)}
        </>
      )}
      {keys.length > 0 && (
        <select value="" title="tag every pair in this tray, or untag them when all are in" onChange={(e) => e.target.value && act(() => void toggleGroup(e.target.value, keyedPairs(keys)))()}>
          <option value="">tag all {keys.length} in this tray…</option>
          {realGroups(s.pairGroups).map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      )}
    </>
  );
}
