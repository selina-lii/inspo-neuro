// What the colours, dashes and widths mean.
import { useContext } from "react";
import { linkLegend, neuronColors, paletteColor, type Legend as LegendSpec } from "../../core/colors";
import { sourceOf } from "../../core/grid";
import type { State } from "../../core/store";
import { stackOf } from "../../stackActions";
import { useStore } from "../useStore";
import { PanelId } from "./panelCcg";

/** What a grid's curves stand for: its segments off a network, the test's rows off a board. */
function gridKey(s: State, grid: State["grids"][number]): [string, string][] {
  const [kind, id] = (sourceOf(s, grid) ?? ":").split(":");
  const st = kind === "board" ? stackOf(id!) : undefined;
  return st ? st.rows.map((r) => [r.name, r.color]) : grid.segments.map((seg) => [seg, paletteColor(seg)]);
}

function LegendBlock({ spec }: { spec: LegendSpec }) {
  if (spec.kind === "categories") {
    return (
      <div className="legend-block">
        <strong>{spec.title}</strong>
        {spec.entries.map(([name, color]) => (
          <span key={name}>
            <i style={{ background: color }} />
            {name}
          </span>
        ))}
      </div>
    );
  }
  const stops = spec.diverging ? "#2166ac, #67a9cf, #e8e8e8, #ef8a62, #b2182b" : "#440154, #3b528b, #21918c, #5ec962, #fde725";
  return (
    <div className="legend-block">
      <strong>{spec.title}</strong>
      <span className="muted">{spec.min}</span>
      <i className="ramp" style={{ background: `linear-gradient(90deg, ${stops})` }} />
      <span className="muted">{spec.max}</span>
    </div>
  );
}

export function LegendBody() {
  const s = useStore();
  const id = useContext(PanelId);
  const grid = s.grids.find((g) => g.legend === id);
  if (grid) return <div className="legend"><LegendBlock spec={{ kind: "categories", title: "curves", entries: gridKey(s, grid) }} /></div>;
  const dash = { uncertain: "uncertain fit", off: "off in segment", unselected: "unselected", none: "" }[s.encoding.dash];
  return (
    <div className="legend">
      <LegendBlock spec={{ ...linkLegend(s), title: `links · ${linkLegend(s).title}` }} />
      <div className="legend-block muted">
        {dash && <span>- - - {dash}</span>}
        <span>{s.encoding.width === "strength" ? "width = strength" : "equal width"} · faint = not fitted</span>
      </div>
      <LegendBlock spec={{ ...neuronColors(s).legend, title: `neurons · ${neuronColors(s).legend.title}` }} />
      <div className="legend-block muted">▲ pyr · ● int</div>
    </div>
  );
}
