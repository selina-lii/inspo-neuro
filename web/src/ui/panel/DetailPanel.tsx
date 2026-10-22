// Selection & details: the focused pair (state, the CCG panel's options, groups, segments) or the focused neuron (values,
// tags, place fields, links), then the tag bar.
import { useEffect, useState } from "react";
import { ensureSegLinks, focusNeuron, focusPair, setMapSegment, setPairState } from "../../actions";
import { areaColor, groupColor, neuronTypeColor, paletteColor, realGroups, TYPE_COLORS } from "../../core/colors";
import { NORMS } from "../../core/norms";
import { strongestFirst } from "../../core/pairs";
import { activeSegment, type CcgOptions } from "../../core/store";
import type { Link } from "../../core/types";
import { api } from "../../io/api";
import { waveformOf } from "../../io/traces";
import { useStore } from "../useStore";
import { type Waveform } from "./CcgPlot";
import { TagBar } from "./TagBar";
import { usePanelCcg } from "./panelCcg";

/** Segments worth a row in the per-segment table: the session's epochs, not its hour and ninth slices. */
const MAIN = /^(pre|maze\d*|post|remaze\d*|sd\d*|rs\d*|nsd\d*)$/i;

export function DetailBody() {
  const s = useStore();
  return (
    <div className="detail">
      {s.focus?.kind === "pair" && <PairInfo ref_={s.focus.ref} tgt={s.focus.tgt} />}
      {s.focus?.kind === "neuron" && <NeuronInfo idx={s.focus.idx} />}
      {!s.focus && <div className="empty">Click a link for its CCG, or a neuron for its values. Shift-drag to box-select neurons and the links between them.</div>}
      <TagBar />
    </div>
  );
}

const OPTION_LABELS: [keyof CcgOptions, string][] = [
  ["baseline", "baseline"], ["acgRef", "ACG ref"], ["acgTgt", "ACG tgt"], ["wf", "ref waveform"], ["fit", "peak fit"], ["window", "test window"], ["line", "line"], ["p", "p"], ["pc", "p corr."], ["jitter", "jitter"],
];

export function CcgOptionsBar() {
  const [o, set] = usePanelCcg();
  const units = useStore().extendUnits;
  return (
    <div className="row wrap">
      <div className="seg small">
        {(["lowres", "highres"] as const).map((r) => (
          <button key={r} className={o.res === r ? "on" : ""} onClick={() => set({ res: r })}>{r === "lowres" ? "lo-res" : "hi-res"}</button>
        ))}
      </div>
      {OPTION_LABELS.map(([k, label]) => (
        <button key={k} className={`chip plain${o[k] ? " on" : ""}`} onClick={() => set({ [k]: !o[k] } as Partial<CcgOptions>)}>{label}</button>
      ))}
      {units.length > 0 && (
        <>
          <span className="muted">window</span>
          <select value={o.extend} onChange={(e) => set({ extend: e.target.value })} title="a stored extend unit: a wider window saved from the Qt panel">
            <option value="">stored CCG</option>
            {units.map((u) => {
              const v = `${u.name}|${u.window_ms}|${u.bin_ms}|${u.segment}`;
              return <option key={v} value={v}>{u.window_ms} ms @ {u.bin_ms} ms ({u.segment})</option>;
            })}
          </select>
        </>
      )}
      <span className="muted">normalize</span>
      {NORMS.map(([k, label]) => (
        <button key={k} className={`chip plain${o.norms.includes(k) ? " on" : ""}`}
          onClick={() => set({ norms: o.norms.includes(k) ? o.norms.filter((n) => n !== k) : [...o.norms, k] })}>{label}</button>
      ))}
    </div>
  );
}

export function PairInfo({ ref_, tgt }: { ref_: number; tgt: number }) {
  const s = useStore();
  const link = s.links.find((l) => l.ref === ref_ && l.tgt === tgt);
  const a = s.neurons[ref_];
  const b = s.neurons[tgt];
  if (!link || !a || !b) return null;
  const reverse = s.links.find((l) => l.ref === tgt && l.tgt === ref_);
  return (
    <section>
      <h2>
        <button className="linkish" style={{ color: neuronTypeColor(a.type) }} onClick={() => focusNeuron(ref_)}>#{a.id} {a.type}</button> →{" "}
        <button className="linkish" style={{ color: neuronTypeColor(b.type) }} onClick={() => focusNeuron(tgt)}>#{b.id} {b.type}</button>
        {reverse && <button className="linkish hyper" title={`strength ${reverse.strength}`} onClick={() => focusPair(tgt, ref_)}>other direction</button>}
      </h2>
      <div className="row wrap">
        <span className="muted">state</span>
        <div className="seg small">
          {(["sel", "unsel", "del"] as const).map((st) => (
            <button key={st} className={link.state === st ? "on" : ""} onClick={() => link.state !== st && setPairState([[ref_, tgt]], st)}>
              {({ sel: "selected", unsel: "unselected", del: "deleted" })[st]}
            </button>
          ))}
        </div>
      </div>
      <CcgOptionsBar />
      <div className="chips">
        <span className="muted">groups</span>
        {realGroups(link.groups).length ? realGroups(link.groups).map((g) => (
          <span key={g} className="tag" style={{ borderColor: groupColor(s, g), boxShadow: `inset 4px 0 0 ${groupColor(s, g)}` }}>{g}</span>
        )) : <span className="muted">none</span>}
      </div>
      {link.rules.length > 0 && (
        <div className="chips">
          <span className="muted">rule sets</span>
          {link.rules.map((r) => <span key={r} className="tag" style={{ borderColor: paletteColor(r), boxShadow: `inset 4px 0 0 ${paletteColor(r)}` }}>{r}</span>)}
        </div>
      )}
      <SegmentTable link={link} />
    </section>
  );
}

/** The pair's strength and on/off in each epoch; a row shows that segment's CCG. */
function SegmentTable({ link }: { link: Link }) {
  const s = useStore();
  const main = s.segments.filter((x) => MAIN.test(x.name));
  useEffect(() => {
    if (s.session) for (const x of main) ensureSegLinks(s.session, x.name);
  }, [s.session, main.map((x) => x.name).join(), s.segLinks]);
  if (!main.length) return null;
  // the Qt GUI's CS under the CCG panel's normalizations; on/off is the GUI's verdict
  const values = main.map((x) => ({ on: s.segLinks[x.name]?.on[link.i] ?? null, raw: s.segLinks[x.name]?.cs[link.i] ?? null }));
  const top = Math.max(1e-9, ...values.map((v) => Math.abs(v.raw ?? 0)));
  const norms = NORMS.filter(([k]) => s.ccg.norms.includes(k)).map(([, label]) => label);
  return (
    <div className="segtable">
      <h3>by segment: CS{norms.length ? ` ${norms.join(" ")}` : ""}</h3>
      {main.map((x, i) => (
        <button key={x.name} className={`segrow${activeSegment(s) === x.name ? " on" : ""}`} onClick={() => setMapSegment(s.activeMap, x.name)}>
          <span className="segname">{x.name}</span>
          <span className={`ondot${values[i]!.on === null ? "" : values[i]!.on ? " yes" : " no"}`} title={values[i]!.on === null ? "loading" : values[i]!.on ? "on" : "off"} />
          <span className="bar"><i style={{ width: `${(Math.abs(values[i]!.raw ?? 0) / top) * 100}%` }} /></span>
          <span className="num">{!s.segLinks[x.name] ? "…" : values[i]!.raw === null ? "–" : +values[i]!.raw!.toPrecision(3)}</span>
        </button>
      ))}
    </div>
  );
}

function NeuronInfo({ idx }: { idx: number }) {
  const s = useStore();
  const n = s.neurons[idx];
  const [curves, setCurves] = useState<{ key: string; curves: { block: string; direction: string; rate: (number | null)[] }[] } | null>(null);
  const [wave, setWave] = useState<{ key: string; wave: Waveform } | null>(null);
  const key = `${s.session}:${n?.id}`;
  useEffect(() => {
    if (!s.session) return;
    let live = true;
    waveformOf(s.session, idx).then((w) => live && setWave({ key, wave: w }));
    return () => {
      live = false;
    };
  }, [key]);
  useEffect(() => {
    if (!s.session || !n) return;
    let live = true;
    api.placefield(s.session, n.id).then((r) => live && setCurves({ key, curves: r.curves }), () => live && setCurves({ key, curves: [] }));
    return () => {
      live = false;
    };
  }, [key]);
  if (!n) return null;
  const v = s.neuronValues;
  const strongest = (xs: Link[]) => xs.sort(strongestFirst(xs));
  const [out, into] = [strongest(s.links.filter((l) => l.ref === idx)), strongest(s.links.filter((l) => l.tgt === idx))];
  const order = new Map(s.segments.map((x, i) => [x.name, i]));
  const rates = v ? Object.entries(v.rates).filter(([seg]) => seg === "all" || MAIN.test(seg)).sort((a, b) => (order.get(a[0]) ?? -1) - (order.get(b[0]) ?? -1)) : [];
  const topRate = Math.max(1e-9, ...rates.map(([, r]) => r[idx] ?? 0));
  return (
    <section>
      <h2>
        <span className="dot big" style={{ background: areaColor(n.area) }} />
        neuron #{n.id}
      </h2>
      <div className="meta">{n.type} · {n.area} · {n.rate.toFixed(2)} Hz · channel {n.channel ?? "?"} · shank {n.probe_shank ?? "?"} · position {n.idx}</div>
      <Chips title="neuron groups" items={n.groups} />
      {v && v.specs.length > 0 && (
        <div className="chips">
          <span className="muted">tags</span>
          {v.specs.map((spec) => {
            const label = spec.labels?.[idx];
            const value = spec.values[idx];
            return (
              <span key={spec.name} className="tag" style={label ? { borderColor: spec.colors[label], boxShadow: `inset 3px 0 0 ${spec.colors[label]}` } : undefined}>
                {spec.name}: {label ?? "–"}{value !== null && value !== undefined ? ` (${value.toPrecision(3)})` : ""}
              </span>
            );
          })}
        </div>
      )}
      {rates.length > 0 && (
        <div className="segtable">
          <h3>firing rate by segment (Hz)</h3>
          {rates.map(([seg, r]) => (
            <div key={seg} className="segrow static">
              <span className="segname">{seg}</span>
              <span className="bar"><i style={{ width: `${((r[idx] ?? 0) / topRate) * 100}%` }} /></span>
              <span className="num">{r[idx] === null || r[idx] === undefined ? "–" : r[idx]!.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {v && Object.keys(v.place).length > 0 && (
        <div className="chips">
          <span className="muted">place cell</span>
          {Object.entries(v.place).map(([seg, p]) => (
            <span key={seg} className={`tag${p.is_place[idx] ? " yes" : ""}`}>{seg}: {p.is_place[idx] ? "yes" : "no"}{p.frmax[idx] ? ` · peak ${p.frmax[idx]!.toFixed(1)} Hz` : ""}</span>
          ))}
        </div>
      )}
      {wave?.key === key && wave.wave?.t_ms && <WaveformPlot wave={wave.wave} color={areaColor(n.area)} />}
      {curves?.key === key && curves.curves.length > 0 && <PlaceCurves curves={curves.curves} />}
      <LinkList title={`out (${out.length})`} links={out} other={(l) => l.tgt} />
      <LinkList title={`in (${into.length})`} links={into} other={(l) => l.ref} />
    </section>
  );
}

const CURVE_COLORS: Record<string, string> = { up: "#3a6df0", down: "#e05555" };

/** 1D place fields: one panel per block, a line per running direction. */
function PlaceCurves({ curves }: { curves: { block: string; direction: string; rate: (number | null)[] }[] }) {
  const blocks = [...new Set(curves.map((c) => c.block))];
  const top = Math.max(1e-9, ...curves.flatMap((c) => c.rate.filter((x): x is number => x !== null)));
  return (
    <div className="placefields">
      <h3>place fields (peak {top.toFixed(1)} Hz) · <span style={{ color: CURVE_COLORS.up }}>up</span> / <span style={{ color: CURVE_COLORS.down }}>down</span></h3>
      <div className="row wrap">
        {blocks.map((b) => (
          <svg key={b} viewBox="0 0 180 64" className="pf">
            <text x={4} y={11} className="tick start">{b}</text>
            {curves.filter((c) => c.block === b).map((c) => {
              const n = c.rate.length;
              const d = c.rate.map((r, i) => (r === null ? "" : `${i && c.rate[i - 1] !== null ? "L" : "M"}${((i / Math.max(n - 1, 1)) * 172 + 4).toFixed(1)},${(60 - (r / top) * 44).toFixed(1)}`)).join("");
              return <path key={c.direction} d={d} fill="none" stroke={CURVE_COLORS[c.direction] ?? "#888"} strokeWidth={1.4} />;
            })}
          </svg>
        ))}
      </div>
    </div>
  );
}

function LinkList({ title, links, other }: { title: string; links: Link[]; other: (l: Link) => number }) {
  const s = useStore();
  return (
    <div className="linklist">
      <h3>{title}</h3>
      {links.slice(0, 60).map((l) => (
        <button key={`${l.ref}-${l.tgt}`} className="linkrow" onClick={() => focusPair(l.ref, l.tgt)}>
          <i style={{ background: TYPE_COLORS[l.type] }} />#{s.neurons[other(l)]?.id} <span className="muted">{l.type}</span>
          <span className="grow" />
          {l.groups.length > 0 && <span className="muted">{l.groups.slice(0, 2).join(", ")}</span>}
          <span className="num">{l.strength}</span>
        </button>
      ))}
    </div>
  );
}

function Chips({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="chips">
      <span className="muted">{title}</span>
      {items.map((g) => (
        <span key={g} className="tag">{g}</span>
      ))}
    </div>
  );
}

function WaveformPlot({ wave, color }: { wave: NonNullable<Waveform>; color: string }) {
  const t = wave.t_ms!;
  const a = wave.amp!;
  const [t0, t1] = [t[0]!, t[t.length - 1]!];
  const span = Math.max(...a.map(Math.abs), 1e-9);
  return (
    <div className="placefields">
      <h3>peak-channel waveform ({(t1 - t0).toFixed(1)} ms)</h3>
      <svg viewBox="0 0 180 64" className="pf">
        <line x1={4} x2={176} y1={32} y2={32} className="axis" />
        <path d={t.map((x, i) => `${i ? "L" : "M"}${(((x - t0) / (t1 - t0)) * 172 + 4).toFixed(1)},${(32 - (a[i]! / span) * 26).toFixed(1)}`).join("")} fill="none" stroke={color} strokeWidth={1.6} />
      </svg>
    </div>
  );
}
