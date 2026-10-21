// What the colours, dashes and widths mean.
import { linkLegend, neuronColors, type Legend as LegendSpec } from "../../core/colors";
import { useStore } from "../useStore";

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
