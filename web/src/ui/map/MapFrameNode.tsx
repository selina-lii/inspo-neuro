// A map's frame in the space: drag its title to move the map, pick the segment it shows, make it the active map.
import type { NodeProps } from "@xyflow/react";
import { removeMap, setActiveMap, setMapSegment } from "../../actions";
import type { MapInstance } from "../../core/store";
import { useStore } from "../useStore";

export type MapFrameData = { map: MapInstance; k: number; active: boolean; count: number; stack: number };

export function MapFrameNode({ data }: NodeProps) {
  const { map, k, active, count, stack } = data as MapFrameData;
  const segments = useStore().segments;
  return (
    <div className={`map-frame${active ? " active" : ""}`} style={{ borderWidth: 2 * k, borderRadius: 16 * k }}>
      <div className="map-frame-head" style={{ fontSize: 13 * k, gap: 6 * k, padding: `${4 * k}px ${10 * k}px`, marginLeft: `${stack * 230 * k}px` }} onClick={() => setActiveMap(map.id)}>
        <strong>{active ? "● " : ""}map</strong>
        <select className="nodrag" value={map.segment} onChange={(e) => setMapSegment(map.id, e.target.value)} style={{ fontSize: 12 * k }}
          title="the segment this map's links show">
          <option value="all">all (whole session)</option>
          {segments.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
        {count > 1 && (
          <button className="nodrag" onClick={(e) => (e.stopPropagation(), removeMap(map.id))} style={{ fontSize: 11 * k }} title="remove this map">×</button>
        )}
      </div>
    </div>
  );
}
