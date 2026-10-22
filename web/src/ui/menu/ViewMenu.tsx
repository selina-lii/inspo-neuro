// How the network is laid out: the layout, its axes or height metric, how far neurons fan apart, the 2D overview map.
import { setLayout, setSpacing } from "../../actions";
import { METRICS } from "../../core/derive";
import { store } from "../../core/store";
import type { LayoutKind } from "../../core/types";
import { useStore } from "../useStore";
import { MenuSection } from "./Menu";

const LAYOUTS: LayoutKind[] = ["physical", "embedding", "axes", "manual"];

export function ViewMenu() {
  const s = useStore();
  const metric = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>{METRICS.map((m) => <option key={m}>{m}</option>)}</select>
  );
  const step = (d: number) => setSpacing(Math.min(4, Math.max(0.5, Math.round((s.spacing + d) * 4) / 4)));
  return (
    <>
      <MenuSection title="layout">
        <div className="seg">
          {LAYOUTS.map((k) => <button key={k} className={s.layout === k ? "on" : ""} onClick={() => setLayout(k)}>{k}</button>)}
        </div>
        {s.layout === "axes" && (
          <>
            {metric(s.axes.x, (x) => setLayout("axes", { ...s.axes, x }))}
            <span className="label">vs</span>
            {metric(s.axes.y, (y) => setLayout("axes", { ...s.axes, y }))}
          </>
        )}
      </MenuSection>
      {s.view === "3d" && s.layout !== "embedding" && <MenuSection title="height in 3D">{metric(s.zMetric, (zMetric) => store.set({ zMetric }))}</MenuSection>}
      <MenuSection title="spread (physical and axes layouts)">
        <button onClick={() => step(-0.25)}>−</button>
        <input type="range" min={0.5} max={4} step={0.25} value={s.spacing} onChange={(e) => setSpacing(Number(e.target.value))} />
        <button onClick={() => step(0.25)}>+</button>
        <span className="num">{s.spacing.toFixed(2)}×</span>
      </MenuSection>
      <MenuSection title="focus">
        <label title="click a neuron to show it with its first-degree neighbours; click a neighbour to open its own too, and so on (click again to close one, Esc clears)">
          <input type="checkbox" checked={s.sweep.on} onChange={(e) => store.set({ sweep: { on: e.target.checked, open: new Set() } })} />minesweeper mode
        </label>
        {s.sweep.on && s.sweep.open.size > 0 && (
          <button onClick={() => store.set({ sweep: { ...s.sweep, open: new Set() } })}>close all {s.sweep.open.size}</button>
        )}
      </MenuSection>
      {s.view === "3d" && (
        <MenuSection title="3D">
          <label title="the cables between objects; their ports stay, so you can still connect">
            <input type="checkbox" checked={s.cables} onChange={(e) => store.set({ cables: e.target.checked })} />cables
          </label>
        </MenuSection>
      )}
      {s.view === "2d" && (
        <MenuSection title="2D">
          <label title="a small map of the whole space in the corner: panels in blue, the box is what you see">
            <input type="checkbox" checked={s.overview} onChange={(e) => store.set({ overview: e.target.checked })} />overview map
          </label>
        </MenuSection>
      )}
    </>
  );
}
