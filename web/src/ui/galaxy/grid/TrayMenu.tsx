// A grid's trays in its right-click menu: move or copy the picked cards to another tray, merge this one into another, tag every pair in it.
import { Fragment } from "react";
import { keyedPairs, toggleGroup } from "../../../actions";
import { traysOf, type CcgGrid } from "../../../core/grid";
import { mergeTray, sendToTray } from "../../../gridActions";
import { testFromGrid, testsFedBy, unfeedTest } from "../../../feedActions";
import { useStore } from "../../useStore";
import { useGridItems } from "./gridItems";
import { exportCards } from "./gridCards";
import { TagSelect } from "./TagSelect";

export function TrayMenu({ grid, act }: { grid: CcgGrid; act: (f: () => void) => () => void }) {
  const s = useStore();
  const keys = useGridItems(grid).map((x) => x.key);
  const picked = keys.filter((k) => s.cells.has(k));
  const trays = traysOf(s, grid);
  return (
    <>
      {picked.length > 0 && (
        <>
          <button onClick={act(() => void exportCards(grid, picked))}>export {picked.length} picked to images</button>
          {(["move", "copy"] as const).map((how) => (
            <Fragment key={how}>
              <button onClick={act(() => sendToTray(grid.id, picked, null, how === "copy"))}>{how} {picked.length} picked to a new tray</button>
              {trays.map((t, i) => t.id !== grid.id && <button key={t.id} onClick={act(() => sendToTray(grid.id, picked, t.id, how === "copy"))}>{how} {picked.length} picked to tray {i + 1}</button>)}
            </Fragment>
          ))}
        </>
      )}
      {trays.map((t, i) => t.id !== grid.id && <button key={`m${t.id}`} onClick={act(() => mergeTray(grid.id, t.id))}>merge this tray into tray {i + 1}</button>)}
      {keys.length > 0 && <button onClick={act(() => testFromGrid(grid, keys))}>new stats test from this grid</button>}
      {testsFedBy(grid.id).map((t) => <button key={`f${t.id}`} onClick={act(() => unfeedTest(grid.id, t.id))}>stop feeding {t.name || "unsaved test"}</button>)}
      {keys.length > 0 && (
        <TagSelect label={`tag all ${keys.length} in this tray…`} title="tag every pair in this tray, or untag them when all are in" onTag={(g) => act(() => void toggleGroup(g, keyedPairs(keys)))()} />
      )}
    </>
  );
}
