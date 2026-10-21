// A named area: drag it to move it with its neurons, resize it when selected, tag what it holds.
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { removeArea, tagArea, updateArea } from "../../actions";
import { visibleLinks } from "../../core/derive";
import { store } from "../../core/store";
import type { Area } from "../../core/types";

export type AreaData = { area: Area; k: number; count: number };

export function AreaNode({ data, selected }: NodeProps) {
  const { area, k, count } = data as AreaData;
  const shown = () => visibleLinks(store.get().links, store.get().filters, store.get().neurons);
  const [name, setName] = useState<string | null>(null);   // the new name while it is typed
  const rename = () => {
    if (name?.trim()) updateArea(area.id, { name: name.trim() });
    setName(null);
  };
  return (
    <div className={`area${selected ? " on" : ""}`} style={{ borderWidth: 2 * k, borderRadius: 14 * k }}>
      <NodeResizer isVisible={selected} minWidth={40 * k} minHeight={30 * k} />
      <div className="area-head nodrag" style={{ fontSize: 12 * k, gap: 6 * k, padding: `${3 * k}px ${8 * k}px` }}>
        {name === null ? (
          <strong onDoubleClick={() => setName(area.name)} title="double-click to rename">{area.name}</strong>
        ) : (
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={rename}
            onKeyDown={(e) => (e.key === "Enter" ? rename() : e.key === "Escape" && setName(null))} style={{ fontSize: 12 * k, width: 140 * k }} />
        )}
        <span className="muted">{count} neurons</span>
        <button onClick={() => tagArea(area, "neuron", shown())} style={{ fontSize: 11 * k }}>tag neurons</button>
        <button onClick={() => tagArea(area, "pair", shown())} style={{ fontSize: 11 * k }} title="shown pairs with both ends inside">tag pairs</button>
        <button onClick={() => removeArea(area.id)} style={{ fontSize: 11 * k }} title="remove the area (tags stay)">×</button>
      </div>
    </div>
  );
}
