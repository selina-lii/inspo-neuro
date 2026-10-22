// A pair node's float bar, a line per filter: sessions, conn types, segments, rules, pair states, value ranges.
import type { PairNode, PairRange } from "../../../core/grid";
import { patchNode } from "../../../gridActions";
import { ListPicker } from "../../stats/ListPicker";
import { RulesPicker } from "../../stats/RulesPicker";
import { useStore } from "../../useStore";
import { FloatBar } from "../stats/BoardOverlay";

const STATES: [string, string][] = [["sel", "selected"], ["unsel", "available"], ["del", "deleted"]];
const FIELDS: [PairRange["field"], string][] = [["strength", "strength"], ["cs", "CS"], ["rate", "firing rate"]];

export function NodeBar({ node }: { node: PairNode }) {
  const s = useStore();
  const options = s.stats.options;
  if (!options) return null;
  const set = (patch: Partial<PairNode>) => patchNode(node.id, patch);
  const segments = [...new Set(["all", ...s.segments.map((x) => x.name)])];
  const setRange = (i: number, patch: Partial<PairRange>) => set({ ranges: node.ranges.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const bound = (i: number, k: "lo" | "hi") => (
    <input type="number" style={{ width: 54 }} placeholder={k === "lo" ? "min" : "max"} value={node.ranges[i]![k] ?? ""}
      onChange={(e) => setRange(i, { [k]: e.target.value === "" ? null : Number(e.target.value) })} />
  );
  return (
    <FloatBar id={`node:${node.id}`} vertical>
      <ListPicker plural="sessions" items={options.pickers.sess.items} selected={node.sessions} empty="every session" onChange={(sessions) => set({ sessions })} />
      <ListPicker plural="types" items={options.pickers.ct.items} selected={node.conn_types} empty="every type" onChange={(conn_types) => set({ conn_types })} />
      <ListPicker plural="segments" items={segments} selected={node.segments} empty="on in any segment" display={(x) => `on in ${x}`} onChange={(segs) => set({ segments: segs })} />
      <RulesPicker rules={node.rules} options={options} onChange={(rules) => set({ rules })} />
      <span className="row">
        {STATES.map(([k, label]) => (
          <button key={k} className={node.states.includes(k) ? "on" : ""} title={`keep ${label} pairs; none on keeps every state`}
            onClick={() => set({ states: node.states.includes(k) ? node.states.filter((x) => x !== k) : [...node.states, k] })}>{label}</button>
        ))}
      </span>
      {node.ranges.map((r, i) => (
        <span key={i} className="row">
          <select value={r.field} onChange={(e) => setRange(i, { field: e.target.value as PairRange["field"] })}>
            {FIELDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          {r.field !== "strength" && (
            <select value={r.segment} title="the segment the value is measured in" onChange={(e) => setRange(i, { segment: e.target.value })}>
              {segments.map((x) => <option key={x}>{x}</option>)}
            </select>
          )}
          {r.field === "rate" && (
            <select value={r.side} title="which neuron's rate" onChange={(e) => setRange(i, { side: e.target.value })}>
              {options.sides.map((x) => <option key={x}>{x}</option>)}
            </select>
          )}
          {bound(i, "lo")}…{bound(i, "hi")}
          <button className="linkish" onClick={() => set({ ranges: node.ranges.filter((_, k) => k !== i) })}>×</button>
        </span>
      ))}
      <button title="keep pairs whose value lies in a range" onClick={() => set({ ranges: [...node.ranges, { field: "strength", segment: "all", side: "either", lo: null, hi: null }] })}>+ range</button>
      {node.added.length > 0 && (
        <span className="row">
          <span className="muted">+{node.added.length} by hand</span>
          <button title="drop the pairs added by hand" onClick={() => set({ added: [] })}>clear</button>
        </span>
      )}
    </FloatBar>
  );
}
