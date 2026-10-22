// A stats test's network stack: the sessions it spans, the rows that cover each, a pair's CCG per row. No React, no three.
import { normalize } from "./norms";
import { resolveFollows, type StatsConfig, type StatsOptions, type StatsResult, type StatsValue } from "./stats";
import type { Link, Neuron, SegLinks, Shank, Trace } from "./types";

/** A board cabled to a network: "main" or a network copy's id; `fresh` until the scene has arranged it. `at`: where the
 * board stood once arranged; the layers it brought in move by the board's offset from there. */
export type Tie = { board: string; network: string; fresh?: boolean; at?: [number, number, number]; owned?: boolean };   // owned: the network was made for this test and goes with it

export type Playback = { board: string; row: number; playing: boolean; ms: number };

/** One session's layer as fetched: the segments and pairs asked for, at a resolution and norms; `want` names a pick card's one pair. */
export type StackLayer = {
  session: string; neurons: Neuron[]; links: Link[]; shanks: Shank[]; hours: Record<string, number>; segLinks: Record<string, SegLinks>;
  lags: number[]; traces: Record<string, Record<string, [number[], number[]]>>; res: string; norms: string; segs: string[]; pairs: string[]; want?: string;
};

export type StackRow = { name: string; color: string; segments: string[] };

/** Sessions with values on the result, in the order its rows first show them. */
export function testSessions(result: StatsResult, values: Record<string, StatsValue>): string[] {
  return [...new Set(result.rows.flatMap((r) => r.ids.map((id) => values[id]?.session).filter((s): s is string => Boolean(s))))];
}

/** Each result row with the segments its values were measured in, 'all' for the whole session. */
export function stackRows(result: StatsResult, config: StatsConfig, options: StatsOptions): StackRow[] {
  const rows = resolveFollows(config.rows, options);
  return result.rows.map((r) => ({
    name: r.name, color: r.color,
    segments: (rows.find((c) => c.name === r.name)?.segments ?? []).map((s) => (s === options.all_segments ? "all" : s)),
  }));
}

/** The pairs of one session on the result, as "ref-tgt". */
export function sessionPairs(result: StatsResult, values: Record<string, StatsValue>, session: string): string[] {
  const out = new Set<string>();
  for (const r of result.rows) for (const id of r.ids) if (values[id]?.session === session) out.add(`${values[id]!.ref}-${values[id]!.tgt}`);
  return [...out];
}

/** Indices of the rows holding a pair ("session|ref|tgt"). */
export const rowsWithPair = (result: StatsResult, values: Record<string, StatsValue>, pair: string): number[] =>
  result.rows.flatMap((r, i) => (r.ids.some((id) => values[id]?.pair === pair) ? [i] : []));

/** A pair's CCG in one row: the row's segments summed, counts and hours alike, then the CCG panel's norms. */
export function rowTrace(layer: StackLayer, row: StackRow, ref: number, tgt: number, norms: string[]): Trace | null {
  const parts = row.segments.map((s) => ({ t: layer.traces[s]?.[`${ref}-${tgt}`], h: layer.hours[s] ?? 0 })).filter((x) => x.t);
  if (!parts.length) return null;
  const sum = (k: 0 | 1) => parts[0]!.t![k].map((_, i) => parts.reduce((a, x) => a + x.t![k][i]!, 0));
  const raw: Trace = { lags: layer.lags, ccg: sum(0), baseline: sum(1) };
  const [a, b] = [layer.neurons[ref], layer.neurons[tgt]];
  return normalize(raw, norms, { refRate: a?.rate ?? 1, tgtRate: b?.rate ?? 1, hours: parts.reduce((x, p) => x + p.h, 0) }).trace;
}

/** The segment a row shows on a session's layer: its first one the layer has links for. */
export const rowSegment = (layer: StackLayer, row: StackRow): string | null => row.segments.find((s) => layer.segLinks[s]) ?? null;
