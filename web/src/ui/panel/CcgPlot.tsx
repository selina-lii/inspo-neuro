// The pair's CCG as bars or a line, with the options the Qt panel has: baseline, ACG overlays, peak fit, test window.
// Clicking a peak's centre line marks it (auto → certain → uncertain → auto).
import { useState } from "react";
import { NORMS } from "../../core/norms";
import type { JitterResult } from "../../io/api";
import type { CcgOptions } from "../../core/store";
import type { FitPeak, PairDetail, Trace } from "../../core/types";

export const W = 380;
export const H = 220;
const BASE_PAD = { l: 40, r: 8, t: 18, b: 32 };
const MONO_WINDOW: [number, number] = [1, 6];

export type Acgs = { ref: number[] | null; tgt: number[] | null };
export type Waveform = { t_ms: number[] | null; amp: number[] | null } | null;
/** One curve on the plot; *base* colours its baseline, *faint* dims it beside a bold one; *width* and *alpha* override both. */
export type Curve = { trace: Trace; color: string; name?: string; base?: string; faint?: boolean; bold?: boolean; width?: number; alpha?: number };

const P_ALPHA = 0.05;

/** About *n* round tick values spanning lo..hi. */
function niceTicks(lo: number, hi: number, n: number): number[] {
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(6));
  return out;
}
const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : +v.toPrecision(3)).toString();

/** `ylim`: a y range shared with other plots, else the plot's own. */
export function CcgPlot({ curves, fitScale, rawFit, options, acgs, wave, jitter, onPeak, title, stroke = 1, card = false, ylim }: {
  stroke?: number; card?: boolean; ylim?: [number, number]; curves: Curve[]; fitScale: number | null; rawFit?: PairDetail["fit"] | null; options: CcgOptions; acgs?: Acgs; wave?: Waveform; jitter?: JitterResult | null; onPeak?: (peak: FitPeak) => void; title: string;
}) {
  // the lag under the pointer, or the one a click pinned
  const [cursor, setCursor] = useState<{ i: number; pinned: boolean } | null>(null);
  const trace = curves[0]!.trace;
  const legend = curves.some((c) => c.name);
  const PAD = { ...BASE_PAD, t: BASE_PAD.t + (legend ? 11 : 0) };
  // the fit is in raw counts: it follows scalar normalisations and hides when the baseline is subtracted
  const fit = options.res === "highres" && options.fit && rawFit && fitScale !== null ? { ...rawFit, curve: rawFit.curve?.map((v) => v / fitScale) } : null;
  const lags = trace.lags;
  const x0 = lags[0]!;
  const x1 = lags[lags.length - 1]!;
  const ys = curves.flatMap((c) => [...c.trace.ccg, ...(options.baseline ? c.trace.baseline : [])]);
  const [ymin, ymax] = ylim ?? [Math.min(0, ...ys) * 1.08, Math.max(...ys, ...(fit?.curve ?? [])) * 1.08 || 1];
  // jitter traces are raw counts on this resolution's bins: they follow scalar normalisations like the fit
  const jit = options.jitter && jitter && fitScale !== null && jitter.j_avg.length === lags.length
    ? { avg: jitter.j_avg.map((v) => v / fitScale), lo: (jitter.bands?.["2.5"] ?? jitter.j_lo).map((v) => v / fitScale), hi: (jitter.bands?.["97.5"] ?? jitter.j_hi).map((v) => v / fitScale) }
    : null;
  const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => H - PAD.b - ((v - ymin) / (ymax - ymin)) * (H - PAD.t - PAD.b);
  // p-values on their own right-hand scale, as −log10 p
  const logp = (ps?: number[]) => ps?.map((v) => -Math.log10(Math.max(v, 1e-12)));
  const pLines = [options.p ? logp(trace.p) : undefined, options.pc ? logp(trace.pc) : undefined];
  const pTop = Math.max(3, ...pLines.flatMap((l) => l ?? []));
  const sp = (v: number) => H - PAD.b - (v / pTop) * (H - PAD.t - PAD.b);
  const bin = (x1 - x0) / (lags.length - 1);
  const path = (xs: number[], ys: number[]) => xs.map((x, i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(ys[i]!).toFixed(1)}`).join("");
  // ACGs share the lag axis but not the counts: each is scaled to the CCG's peak so its shape reads beside it
  const scaled = (acg: number[] | null) => {
    if (!acg) return null;
    const peak = Math.max(...acg.filter((_, i) => Math.abs(lags[i]!) > bin / 2), 1e-9);
    const top = Math.max(...trace.ccg);
    return acg.map((v, i) => (Math.abs(lags[i]!) <= bin / 2 ? NaN : (v / peak) * top));
  };
  const acgRef = options.acgRef && acgs ? scaled(acgs.ref) : null;
  const acgTgt = options.acgTgt && acgs ? scaled(acgs.tgt) : null;
  const line = (ys: number[]) => lags.map((x, i) => (Number.isFinite(ys[i]!) ? `${i && Number.isFinite(ys[i - 1]!) ? "L" : "M"}${sx(x).toFixed(1)},${sy(ys[i]!).toFixed(1)}` : "")).join("");
  const ticks = [x0, x0 / 2, 0, x1 / 2, x1];
  const yTicks = niceTicks(ymin, ymax, 5);
  const binAt = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const lag = x0 + ((x - PAD.l) / (W - PAD.l - PAD.r)) * (x1 - x0);
    return Math.min(lags.length - 1, Math.max(0, Math.round((lag - x0) / bin)));
  };
  const c = cursor && cursor.i < lags.length ? cursor.i : null;
  const readout = c === null ? [] : [
    `${lags[c]!.toFixed(2)} ms`, `ccg ${fmt(trace.ccg[c]!)}`,
    ...(options.baseline ? [`baseline ${fmt(trace.baseline[c]!)}`] : []),
    ...(options.p && trace.p ? [`p ${trace.p[c]!.toPrecision(2)}`] : []),
    ...(options.pc && trace.pc ? [`p corr. ${trace.pc[c]!.toPrecision(2)}`] : []),
  ];
  const boxX = c !== null && sx(lags[c]!) > W / 2 ? sx(lags[c]!) - 96 : sx(lags[c ?? 0]!) + 4;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ccg"
      onMouseMove={(e) => !cursor?.pinned && setCursor({ i: binAt(e), pinned: false })}
      onMouseLeave={() => !cursor?.pinned && setCursor(null)}
      onClick={(e) => !(e.target as Element).closest(".peakgroup") && setCursor(cursor?.pinned ? null : { i: binAt(e), pinned: true })}>
      <text x={W / 2} y={11} className="tick title">{title}</text>
      {legend && <text x={W / 2} y={23} className="tick">{curves.map((c, k) => <tspan key={k} fill={c.color} dx={k ? 8 : 0}>{c.name}</tspan>)}</text>}
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} className="grid" />
          <text x={PAD.l - 3} y={sy(t) + 3} className="tick end">{fmt(t)}</text>
        </g>
      ))}
      <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="axis" />
      {!card && <text transform={`translate(9 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} className="tick">{options.norms.length ? `count ${NORMS.filter(([k]) => options.norms.includes(k)).map(([, l]) => l).join(" ")}` : "count"}</text>}
      {options.window && <rect x={sx(MONO_WINDOW[0])} width={sx(MONO_WINDOW[1]) - sx(MONO_WINDOW[0])} y={PAD.t} height={H - PAD.t - PAD.b} className="testwin" />}
      <line x1={sx(0)} x2={sx(0)} y1={PAD.t} y2={H - PAD.b} className="axis zero" />
      {/* overlaid curves read only as lines */}
      {options.line || curves.length > 1 ? curves.map((c, k) => (
        <path key={k} d={path(lags, c.trace.ccg)} fill="none" stroke={c.color} strokeWidth={(c.width ?? (c.bold ? 2.4 : 1.4)) * stroke} opacity={c.alpha ?? (c.faint ? 0.35 : 1)} />
      )) : (
        trace.ccg.map((v, i) => (
          <rect key={i} x={sx(lags[i]! - bin / 2)} width={Math.max(sx(bin) - sx(0) - (sx(bin) - sx(0) > 3 ? 0.3 : 0), 1)} y={Math.min(sy(v), sy(0))} height={Math.abs(sy(0) - sy(v))} fill={curves[0]!.color} opacity={0.9} />
        ))
      )}
      {jit && (
        <>
          <path d={`${path(lags, jit.hi)}${lags.slice().reverse().map((x, i) => `L${sx(x).toFixed(1)},${sy(jit.lo[lags.length - 1 - i]!).toFixed(1)}`).join("")}Z`} className="jband" />
          <path d={path(lags, jit.avg)} className="jline" />
        </>
      )}
      {options.baseline && curves.map((c, k) => <path key={k} d={path(lags, c.trace.baseline)} className="baseline" style={{ stroke: c.base, strokeWidth: 1.3 * stroke }} opacity={c.alpha ?? (c.faint ? 0.35 : 1)} />)}
      {acgRef && <path d={line(acgRef)} className="acg ref" />}
      {acgTgt && <path d={line(acgTgt)} className="acg tgt" />}
      {fit?.lags && fit.curve && <path d={path(fit.lags, fit.curve)} className="fitcurve" />}
      {options.wf && wave?.t_ms && wave.amp && (() => {
        // the ref's spike on the lag axis, scaled into the upper half of the plot
        const span = Math.max(...wave.amp.map(Math.abs), 1e-9);
        const mid = ymin + (ymax - ymin) * 0.7;
        const amp = (ymax - ymin) * 0.25;
        return <path d={wave.t_ms.map((t, i) => `${i ? "L" : "M"}${sx(t).toFixed(1)},${sy(mid + (wave.amp![i]! / span) * amp).toFixed(1)}`).join("")} className="wave" />;
      })()}
      {pLines.map((l, k) => l && <path key={k} d={lags.map((x, i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sp(l[i]!).toFixed(1)}`).join("")} className={`pline${k ? " corrected" : ""}`} />)}
      {(options.p || options.pc) && (
        <>
          <line x1={PAD.l} x2={W - PAD.r} y1={sp(-Math.log10(P_ALPHA))} y2={sp(-Math.log10(P_ALPHA))} className="palpha" />
          <text x={W - PAD.r - 2} y={sp(-Math.log10(P_ALPHA)) - 2} className="tick end">p {P_ALPHA}</text>
          <text x={W - PAD.r - 2} y={PAD.t + 8} className="tick end">−log₁₀p {pTop.toFixed(0)}</text>
        </>
      )}
      {fit?.peaks?.map((p, i) => (
        <g key={i} className="peakgroup" onClick={() => onPeak?.(p)}>
          {p.mono && <rect x={sx(p.edges[0])} width={sx(p.edges[1]) - sx(p.edges[0])} y={PAD.t} height={H - PAD.t - PAD.b} className="fwhm" />}
          <line x1={sx(p.center)} x2={sx(p.center)} y1={PAD.t} y2={H - PAD.b} className={`peak${p.confident ? " ok" : " unsure"}${p.called ? " hand" : ""}`} />
          <rect x={sx(p.center) - 5} width={10} y={PAD.t} height={H - PAD.t - PAD.b} className="peakhit">
            <title>{`${p.center.toFixed(2)} ms · ${p.confident ? "certain" : "uncertain"}${p.called ? " (hand)" : ""} · click: auto → certain → uncertain → auto`}</title>
          </rect>
        </g>
      ))}
      <line x1={PAD.l} x2={W - PAD.r} y1={sy(0)} y2={sy(0)} className="axis" />
      {ticks.map((t) => (
        <text key={t} x={sx(t)} y={H - PAD.b + 11} className="tick">{Math.round(t * 10) / 10}</text>
      ))}
      {!card && <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} className="tick">lag (ms)</text>}
      {c !== null && (
        <g className={`cursor${cursor!.pinned ? " pinned" : ""}`}>
          <line x1={sx(lags[c]!)} x2={sx(lags[c]!)} y1={PAD.t} y2={H - PAD.b} />
          <rect x={boxX} y={PAD.t + 2} width={92} height={readout.length * 11 + 4} rx={3} />
          {readout.map((t, k) => <text key={k} x={boxX + 4} y={PAD.t + 12 + k * 11}>{t}</text>)}
        </g>
      )}
    </svg>
  );
}
