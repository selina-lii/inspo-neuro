// CCG traces per (session, segment), fetched once in bulk and held as typed arrays: a click draws from memory.
import type { PairDetail, Trace } from "../core/types";
import { api } from "./api";

type Block = { lags: number[]; rows: Float32Array; acg: Float32Array; p: Float32Array; pc: Float32Array; bins: number };
type SegmentTraces = { index: Map<string, number>; lowres: Block; highres: Block };

const KEEP = 4;   // segments held at once; the oldest is dropped
const held = new Map<string, SegmentTraces>();
const pending = new Map<string, Promise<void>>();
const fits = new Map<string, Promise<PairDetail["fit"]>>();

export const tracesKey = (session: string, segment: string): string => `${session}:${segment}`;

export function loadTraces(session: string, segment: string): Promise<void> {
  const key = tracesKey(session, segment);
  if (held.has(key)) return Promise.resolve();
  if (!pending.has(key)) {
    pending.set(key, Promise.all([
      api.traces(session, segment),
      api.tracesBin(session, "lowres", segment),
      api.tracesBin(session, "highres", segment),
      api.tracesBin(session, "lowres_acg", segment),
      api.tracesBin(session, "highres_acg", segment),
      api.tracesBin(session, "lowres_p", segment),
      api.tracesBin(session, "lowres_pc", segment),
      api.tracesBin(session, "highres_p", segment),
      api.tracesBin(session, "highres_pc", segment),
    ]).then(([t, lo, hi, loAcg, hiAcg, loP, loPc, hiP, hiPc]) => {
      if ([...held.keys()].some((k) => !k.startsWith(`${session}:`))) held.clear();
      while (held.size >= KEEP) held.delete(held.keys().next().value!);
      held.set(key, {
        index: new Map(t.pairs.map(([r, g], i) => [`${r}-${g}`, i])),
        lowres: { lags: t.lowres_lags, rows: lo, acg: loAcg, p: loP, pc: loPc, bins: t.lowres_lags.length },
        highres: { lags: t.highres_lags, rows: hi, acg: hiAcg, p: hiP, pc: hiPc, bins: t.highres_lags.length },
      });
    }).finally(() => pending.delete(key)));
  }
  return pending.get(key)!;
}

export function traceOf(session: string, segment: string, ref: number, tgt: number, res: "lowres" | "highres"): Trace | null {
  const t = held.get(tracesKey(session, segment));
  const row = t?.index.get(`${ref}-${tgt}`);
  if (!t || row === undefined) return null;
  const { lags, rows, p, pc, bins } = t[res];
  const start = row * bins * 2;
  return {
    lags, ccg: Array.from(rows.subarray(start, start + bins)), baseline: Array.from(rows.subarray(start + bins, start + 2 * bins)),
    p: Array.from(p.subarray(row * bins, (row + 1) * bins)), pc: Array.from(pc.subarray(row * bins, (row + 1) * bins)),
  };
}

/** One neuron's ACG in the segment, on the same lag axis as its CCGs. */
export function acgOf(session: string, segment: string, neuron: number, res: "lowres" | "highres"): number[] | null {
  const t = held.get(tracesKey(session, segment));
  if (!t) return null;
  const { acg, bins } = t[res];
  return Array.from(acg.subarray(neuron * bins, (neuron + 1) * bins));
}

/** The pair's peak fit in a segment, fetched once; `forget` drops it after its calls change. */
export function fitOf(session: string, segment: string, ref: number, tgt: number): Promise<PairDetail["fit"]> {
  const key = `${session}:${segment}:${ref}-${tgt}`;
  if (!fits.has(key)) fits.set(key, api.fit(session, ref, tgt, segment));
  return fits.get(key)!;
}

export function forgetFits(session: string, ref: number, tgt: number): void {
  for (const k of [...fits.keys()]) if (k.startsWith(`${session}:`) && k.endsWith(`:${ref}-${tgt}`)) fits.delete(k);
}

export function setFit(session: string, segment: string, ref: number, tgt: number, fit: PairDetail["fit"]): void {
  fits.set(`${session}:${segment}:${ref}-${tgt}`, Promise.resolve(fit));
}

const waveforms = new Map<string, Promise<{ t_ms: number[] | null; amp: number[] | null }>>();

/** A neuron's peak-channel waveform, fetched once per session and neuron. */
export function waveformOf(session: string, idx: number): Promise<{ t_ms: number[] | null; amp: number[] | null }> {
  const key = `${session}:${idx}`;
  if (!waveforms.has(key)) waveforms.set(key, api.waveform(session, idx));
  return waveforms.get(key)!;
}
