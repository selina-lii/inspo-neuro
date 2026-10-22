// The CS settings a test computes under, laid out as NeuroPy's Normalization and Baseline & Connection Strength sections.
import { useEffect, useState, type ReactNode } from "react";
import { fail } from "../../actions";
import { api } from "../../io/api";
import { useStore } from "../useStore";

type Display = Record<string, unknown>;
type Interval = [number | null, number | null];

const NORMS: [string, string][] = [["REF_FRATE", "Ref f-rate"], ["TARGET_FRATE", "Tgt f-rate"], ["TIME_SPAN", "Time (hr)"], ["TIME_SECOND", "Time (sec)"], ["TOTAL_AREA", "CCG total area"]];
const SCALES: [string, string][] = [["pair", "Same scale (pair)"], ["session", "Same scale (session)"], ["visible", "Same scale (visible)"]];
const BASELINES: [string, string][] = [["conv", "Conv"], ["tailed", "Tailed"], ["global", "Global"], ["jitter", "Jitter"]];
const EXPLAIN: Record<string, string> = {
  conv: "Conv: Convolution smoothed null baseline",
  tailed: "Tailed: ACG deconvolution, tail-bin baseline",
  global: "Global: max bin outside of test window as baseline",
  jitter: "Jitter: Bootstrapped baseline from surrogate data using interval jitter",
};

const ms = (v: number | null) => (v === null ? "" : String(+(v * 1000).toPrecision(6)));
const sec = (text: string) => (text.trim() === "" || /^[+-]?inf$/i.test(text.trim()) ? null : Number(text) / 1000);

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="qsection">
      <button className="qsection-head" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"} {title}</button>
      {open && <div className="qsection-body">{children}</div>}
    </div>
  );
}

function Chip({ on, label, title, onClick }: { on: boolean; label: string; title?: string; onClick(): void }) {
  return <button className={`qchip${on ? " on" : ""}`} title={title} onClick={onClick}>{label}</button>;
}

export function DisplayEditor({ display, defaults, onChange }: { display: Display | null; defaults: Display; onChange(d: Display): void }) {
  const d = { ...defaults, ...(display ?? {}) };
  const set = (patch: Display) => onChange({ ...d, ...patch });
  const flag = (k: string) => Boolean(d[k]);
  const norms = (d.norms as string[]) ?? [];
  const toggleNorm = (n: string) => set({ norms: norms.includes(n) ? norms.filter((x) => x !== n) : [...norms, n].sort() });
  const method = d.baseline_method as string;
  const win = d.test_window as [number, number];
  const tails = (d.tail_window as Interval[]).length ? (d.tail_window as Interval[]) : [[null, null] as Interval];
  const setTail = (i: number, k: 0 | 1, text: string) => set({ tail_window: tails.map((t, j) => (j === i ? (k ? [t[0], sec(text)] : [sec(text), t[1]]) : t)) });
  const session = useStore().session;
  const [extends_, setExtends] = useState<string[]>([]);
  useEffect(() => void (session && api.extends(session).then(({ units }) => setExtends([...new Set(units.map((u) => u.name))].sort())).catch(fail)), [session]);

  return (
    <div className="qsections">
      <Section title="Normalization">
        <div className="qrow wrap">{NORMS.map(([k, label]) => <Chip key={k} on={norms.includes(k)} label={label} onClick={() => toggleNorm(k)} />)}</div>
        <div className="qrow wrap">
          <Chip on={norms.includes("BASELINE")} label="Subtract baseline" onClick={() => toggleNorm("BASELINE")} />
          {SCALES.map(([k, label]) => <Chip key={k} on={d.same_scale_mode === k} label={label} onClick={() => set({ same_scale_mode: d.same_scale_mode === k ? null : k })} />)}
        </div>
      </Section>
      <Section title="Baseline & Connection Strength">
        <div className="qrow wrap">
          <span>Measure:</span>
          {["STG", "JBSI"].map((m) => <label key={m}><input type="radio" checked={d.cs_metric === m} onChange={() => set({ cs_metric: m })} />{m}</label>)}
          <span className="grow" />
          <span>Window:</span><input className="qms" defaultValue={ms(win[0])} key={`w0${win[0]}`} onBlur={(e) => set({ test_window: [sec(e.target.value) ?? 0, win[1]] })} />
          <span>–</span><input className="qms" defaultValue={ms(win[1])} key={`w1${win[1]}`} onBlur={(e) => set({ test_window: [win[0], sec(e.target.value) ?? 0] })} /><span>ms</span>
        </div>
        <div className="qrow wrap">
          <Chip on={flag("cs_nonneg")} label="non-negative" onClick={() => set({ cs_nonneg: !flag("cs_nonneg") })} />
          <Chip on={flag("cs_offzero")} label="non-sig → 0" title="Connection strength of off pairs counts as 0" onClick={() => set({ cs_offzero: !flag("cs_offzero") })} />
        </div>
        <div className="qrow wrap">
          <span>Baseline:</span>
          {BASELINES.map(([k, label]) => <label key={k}><input type="radio" checked={method === k} onChange={() => set({ baseline_method: k })} />{label}</label>)}
          <span className="grow" />
          <Chip on={flag("show_test_window")} label="Test window" onClick={() => set({ show_test_window: !flag("show_test_window") })} />
        </div>
        {(method === "conv" || method === "jitter") && (
          <div className="qrow">
            <Chip on={flag("show_p")} label="p" onClick={() => set({ show_p: !flag("show_p") })} />
            <Chip on={flag("show_pc")} label="p-corrected" onClick={() => set({ show_pc: !flag("show_pc") })} />
          </div>
        )}
        <div className="qexplain">{EXPLAIN[method] ?? ""}</div>
        {method === "tailed" && (
          <>
            <div className="qrow wrap">
              <span>Average of:</span>
              <select value={d.tail_source as string} onChange={(e) => set({ tail_source: e.target.value })}>{["bins", "conv", "jitter"].map((x) => <option key={x}>{x}</option>)}</select>
              <span>from:</span>
              <select value={(d.cs_tail_extend as string) || "native"} title="Read the tails from a wider extend of the same bin size; pairs or sessions without one fall back to the native window"
                onChange={(e) => set({ cs_tail_extend: e.target.value === "native" ? "" : e.target.value })}>
                {["native", ...extends_].map((x) => <option key={x}>{x}</option>)}
              </select>
              <span className="grow" />
              <Chip on={flag("show_tail_window")} label="Tail window" onClick={() => set({ show_tail_window: !flag("show_tail_window") })} />
            </div>
            {tails.map((t, i) => (
              <div className="qrow" key={`${i}${t.join()}`}>
                <span>Tail:</span>
                <input className="qms" placeholder="inf" defaultValue={ms(t[0])} onBlur={(e) => setTail(i, 0, e.target.value)} />
                <span>–</span>
                <input className="qms" placeholder="inf" defaultValue={ms(t[1])} onBlur={(e) => setTail(i, 1, e.target.value)} />
                <span>ms</span>
                <button className="qchip" onClick={() => set({ tail_window: [...tails, [null, null]] })}>+</button>
                {i > 0 && <button className="qchip" onClick={() => set({ tail_window: tails.filter((_, j) => j !== i) })}>−</button>}
              </div>
            ))}
          </>
        )}
      </Section>
    </div>
  );
}
