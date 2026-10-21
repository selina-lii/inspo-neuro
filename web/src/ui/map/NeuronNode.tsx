// A neuron as React Flow renders it: a dot, or a card where one fits; sizes are in screen pixels times k.
import type { NodeProps } from "@xyflow/react";
import type { Neuron } from "../../core/types";

export const CARD = { w: 96, h: 42 };
export const DOT = 13;

export type NeuronData = { neuron: Neuron; card: boolean; k: number; lit: boolean; color: string };

export function NeuronNode({ data, selected }: NodeProps) {
  const { neuron, card, k, lit, color } = data as NeuronData;
  const ring = selected || lit;
  if (!card) {
    return (
      <div
        className={`ndot ${neuron.type === "pyr" ? "pyr" : "int"}${ring ? " ring" : ""}`}
        style={{ width: DOT * k, height: DOT * k, background: color, outlineWidth: 2.5 * k }}
        title={`#${neuron.id} ${neuron.type} ${neuron.area} ${neuron.rate.toFixed(1)} Hz`}
      />
    );
  }
  return (
    <div className={`card${ring ? " selected" : ""}`} style={{ width: CARD.w * k, height: CARD.h * k, borderColor: color, borderWidth: 2 * k, borderRadius: 7 * k, padding: `${2 * k}px ${6 * k}px`, fontSize: 11 * k, outlineWidth: 3 * k }}>
      <div className="card-title">
        <span className="dot" style={{ background: color, width: 8 * k, height: 8 * k }} />
        {neuron.type === "pyr" ? "▲" : "●"} #{neuron.id}
      </div>
      <div className="card-meta">
        {neuron.area} · {neuron.rate.toFixed(1)} Hz
      </div>
      {neuron.groups.length > 0 && <div className="card-tags">{neuron.groups.join(" · ")}</div>}
    </div>
  );
}
