// A curve style node's float bar: per segment a colour, thickness and opacity, and ▲ ▼ to lay it over or under the others.
import { CURVE_DEFAULT, type StyleNode } from "../../../core/grid";
import { layerCurve, setCurveStyle } from "../../../gridActions";
import { useStore } from "../../useStore";
import { FloatBar } from "../stats/BoardOverlay";
import { styleLabels } from "./StyleNodeObject";

export function StyleBar({ node }: { node: StyleNode }) {
  const s = useStore();
  const labels = styleLabels(s, node);
  return (
    <FloatBar id={`style:${node.id}`}>
      {[...labels].reverse().map(([label, color]) => {
        const c = node.curves.find((x) => x.label === label) ?? { label, color, ...CURVE_DEFAULT };
        const set = (patch: Partial<typeof c>) => setCurveStyle(node.id, label, color, patch);
        return (
          <span key={label} className="row">
            <span className="sep" />
            <span>{label}</span>
            <input type="color" value={c.color} title="colour" onChange={(e) => set({ color: e.target.value })} />
            <input type="number" min={0.2} max={8} step={0.2} style={{ width: 44 }} value={c.width} title="line thickness" onChange={(e) => e.target.value && set({ width: Number(e.target.value) })} />
            <input type="range" min={0.05} max={1} step={0.05} style={{ width: 56 }} value={c.alpha} title={`opacity ${Math.round(c.alpha * 100)}%`} onChange={(e) => set({ alpha: Number(e.target.value) })} />
            <button title="lay it over the next segment" onClick={() => layerCurve(node.id, labels, label, 1)}>▲</button>
            <button title="lay it under the next segment" onClick={() => layerCurve(node.id, labels, label, -1)}>▼</button>
          </span>
        );
      })}
    </FloatBar>
  );
}
