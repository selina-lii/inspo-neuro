// A row's pair rules: a pair joins the row when every rule holds. The same cascade as the Qt rule row: kind, name, side, values.
import type { Rule, StatsOptions } from "../../core/stats";
import { float, useListClick, usePopover } from "./ListPicker";

// NeuroPy's DerivedRule.DISTANCE: a location rule whose one value is the µm a pair must be apart by more than
const DISTANCE = "distance";
const MAX_UM = 500;

const describe = (r: Rule, display: (v: string) => string) => {
  const subject = r.kind.startsWith("pair") ? "pair" : `${r.side} neuron`;
  if (r.name === DISTANCE) return `${subject} distance > ${r.values[0] ?? "…"} µm`;
  return `${subject} ${r.name || r.kind.split(" ").slice(1).join(" ")} is ${r.values.map(display).join(" or ") || "…"}`;
};

export function RulesPicker({ rules, onChange, options, locked = false }: { rules: Rule[]; onChange(next: Rule[]): void; options: StatsOptions; locked?: boolean }) {
  const { open, setOpen, ref, pop } = usePopover();
  const display = (v: string) => options.display[v] ?? v;
  const label = rules.length === 0 ? "all pairs" : rules.length === 1 ? describe(rules[0]!, display) : `${rules.length} rules`;
  const set = (i: number, patch: Partial<Rule>) => onChange(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const kinds = Object.keys(options.rules);
  const fresh = (kind: string): Rule => ({ kind, name: Object.keys(options.rules[kind]!)[0] ?? "", values: [], side: "either" });

  return (
    <div className={`picker${locked ? " locked" : ""}`} ref={ref}>
      <button className={rules.length ? "on" : ""} disabled={locked} title={rules.map((r) => describe(r, display)).join("\nand ")} onClick={() => setOpen(!open)}>
        {locked ? "↑ " : ""}{label} ▾
      </button>
      {open && float(ref.current, (
        <div className="picker-pop rules-pop" ref={pop}>
          <div className="muted">A pair joins when every rule holds.</div>
          {rules.map((r, i) => {
            const names = Object.keys(options.rules[r.kind] ?? {});
            const values = options.rules[r.kind]?.[r.name] ?? [];
            return (
              <div className="rule" key={i}>
                <div className="row">
                  <select value={r.kind} onChange={(e) => onChange(rules.map((x, k) => (k === i ? fresh(e.target.value) : x)))}>
                    {kinds.map((k) => <option key={k}>{k}</option>)}
                  </select>
                  {names.length > 1 || names[0] ? (
                    <select value={r.name} onChange={(e) => set(i, { name: e.target.value, values: e.target.value === DISTANCE ? ["0"] : [] })}>
                      {names.map((n) => <option key={n}>{n}</option>)}
                    </select>
                  ) : null}
                  {r.kind.startsWith("neuron") && (
                    <select value={r.side} onChange={(e) => set(i, { side: e.target.value })}>
                      {options.sides.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  )}
                  <button className="linkish" onClick={() => onChange(rules.filter((_, k) => k !== i))}>remove</button>
                </div>
                {r.name === DISTANCE
                  ? <Distance um={Number(r.values[0] ?? 0)} onChange={(um) => set(i, { values: [String(um)] })} />
                  : <RuleValues values={values} picked={r.values} display={display} onChange={(next) => set(i, { values: next })} />}
              </div>
            );
          })}
          <button onClick={() => onChange([...rules, fresh(kinds[0]!)])}>+ rule</button>
        </div>
      ))}
    </div>
  );
}

function RuleValues({ values, picked, display, onChange }: { values: string[]; picked: string[]; display(v: string): string; onChange(next: string[]): void }) {
  const click = useListClick(values, picked, onChange);
  return (
    <div className="rule-values">
      {values.map((v) => (
        <label key={v} onClick={(e) => click(v, e)}>
          <input type="checkbox" checked={picked.includes(v)} readOnly />
          {display(v)}
        </label>
      ))}
    </div>
  );
}

/** Distance > x µm: a slider over the usual range, and a box for any value. */
function Distance({ um, onChange }: { um: number; onChange(um: number): void }) {
  return (
    <div className="row">
      <span className="muted">distance &gt;</span>
      <input type="range" min={0} max={MAX_UM} step={5} value={Math.min(um, MAX_UM)} onChange={(e) => onChange(Number(e.target.value))} />
      <input type="number" min={0} style={{ width: 64 }} value={um} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="muted">µm</span>
    </div>
  );
}
