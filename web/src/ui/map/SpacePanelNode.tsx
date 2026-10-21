// A panel living in the 2D space: it zooms and moves with the map, and resizes from any edge.
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { PointerEventHandler } from "react";
import { closePanel, patchPanel } from "../../actions";
import type { SpacePanel } from "../../core/store";
import { CcgBody } from "../panel/CcgPanel";
import { DetailBody } from "../panel/DetailPanel";
import { LegendBody } from "../panel/Legend";
import { MetadataBody } from "../panel/Metadata";
import { PairList } from "../panel/PairList";
import { Timeline } from "../panel/Timeline";
import { StatsPanel } from "../stats/StatsPanel";
import { PanelId } from "../panel/panelCcg";

export type SpacePanelData = { panel: SpacePanel; k: number };

export const PANEL_TITLES = { metadata: "Metadata", legend: "Legend", ccg: "CCG", details: "Selection & details", timeline: "Time slider · segments", pairs: "Pairs", stats: "Stats tests" };
const BODY = { metadata: MetadataBody, legend: LegendBody, ccg: CcgBody, details: DetailBody, timeline: Timeline, pairs: PairList, stats: StatsPanel };

/** The title bar both views share: collapse and close; the Add menu brings a closed panel back. */
export function PanelHead({ panel, hint, onPointerDown, onPointerMove, onPointerUp }: {
  panel: SpacePanel; hint?: string; onPointerDown?: PointerEventHandler; onPointerMove?: PointerEventHandler; onPointerUp?: PointerEventHandler;
}) {
  return (
    <div className="space-panel-head" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <span>{PANEL_TITLES[panel.kind]}{hint && <span className="muted"> · {hint}</span>}</span>
      <span>
        <button className="linkish nodrag" onClick={() => patchPanel(panel.id, { collapsed: !panel.collapsed })} title={panel.collapsed ? "expand" : "collapse"}>
          {panel.collapsed ? "▸" : "▾"}
        </button>
        <button className="linkish nodrag" onClick={() => closePanel(panel.id)} title="close">✕</button>
      </span>
    </div>
  );
}

export function SpacePanelNode({ data }: NodeProps) {
  const { panel, k } = data as SpacePanelData;
  const Body = BODY[panel.kind];
  return (
    <>
      <div className="space-panel" style={{ width: panel.w, height: panel.collapsed ? "auto" : panel.h, transform: `scale(${k})` }}>
        <PanelHead panel={panel} hint="drag an edge to resize" />
        {!panel.collapsed && <div className="space-panel-body nowheel nodrag nopan"><PanelId.Provider value={panel.id}><Body /></PanelId.Provider></div>}
      </div>
      {/* after the content, so its handles sit above it and take the pointer */}
      <NodeResizer isVisible minWidth={240 * k} minHeight={120 * k} color="#3a6df0" />
    </>
  );
}
