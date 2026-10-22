// CCG normalizations, as NeuroPy's CCGNorm.apply does them and in its order: each divides CCG and baseline alike,
// BASELINE then subtracts the baseline.
import type { State } from "./store";
import type { Trace } from "./types";

export const NORMS: [string, string][] = [
  ["REF_FRATE", "÷ ref rate"],
  ["TARGET_FRATE", "÷ tgt rate"],
  ["TIME_SPAN", "÷ hours"],
  ["TIME_SECOND", "÷ seconds"],
  ["TOTAL_AREA", "÷ area"],
  ["BASELINE", "− baseline"],
];

export type NormInputs = { refRate: number; tgtRate: number; hours: number };

/** A segment's length in hours, the whole session for 'all'. */
export function segmentHours(s: State, segment: string): number {
  const seg = s.segments.find((x) => x.name === segment);
  return (seg ? seg.duration : s.bounds[1] - s.bounds[0]) / 3600;
}

/** The trace under *norms*, and the one factor a fit curve (in raw counts) is divided by; null when no single factor maps it. */
export function normalize(trace: Trace, norms: string[], inputs: NormInputs): { trace: Trace; fitScale: number | null } {
  if (!norms.length) return { trace, fitScale: 1 };
  let ccg = trace.ccg.slice();
  let baseline = trace.baseline.slice();
  let scale = 1;
  const divide = (f: number) => {
    const d = Math.max(f, 1e-12);
    ccg = ccg.map((v) => v / d);
    baseline = baseline.map((v) => v / d);
    scale *= d;
  };
  const has = (n: string) => norms.includes(n);
  if (has("REF_FRATE")) divide(inputs.refRate);
  if (has("TARGET_FRATE")) divide(inputs.tgtRate);
  if (has("TIME_SPAN")) divide(inputs.hours);
  if (has("TIME_SECOND")) divide(inputs.hours * 3600);
  if (has("TOTAL_AREA")) divide(ccg.reduce((a, v) => a + Math.abs(v), 0));
  if (has("BASELINE")) {
    ccg = ccg.map((v, i) => v - baseline[i]!);
    baseline = baseline.map(() => 0);
  }
  return { trace: { ...trace, ccg, baseline }, fitScale: has("BASELINE") ? null : scale };
}
