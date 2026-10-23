// A result's plot laid out in board units, as the Qt stats figure draws it: bars (mean ± SEM) or violins, jittered dots,
// lines joining a pair's repeated measures, significance brackets above the plot box. Pure: no three.
import { repeatedPairs, type StatsResult, type StatsValue, type ViewConfig } from "../../../core/stats";

export const BOARD_H = 4;
export const MARGIN = { left: 0.9, right: 0.3, bottom: 0.75, title: 0.44 };
/** A board's frame height before brackets, in its own units. */
export const FRAME_H = BOARD_H + MARGIN.bottom + 0.2 + MARGIN.title;
export const ROW_W = 1.4;
export const BRACKET_STEP = 0.28;

export type BoardDot = { id: string; x: number; y: number; z: number; row: number; outlier: boolean };

export type BoardRow = {
  x: number; name: string; color: string; n: number;
  bar: { mean: number; sem: number } | null;
  violin: { y: number; half: number }[] | null;
  median: number | null;
};

export type BoardBracket = { x0: number; x1: number; level: number; star: string };

export type BoardLayout = {
  w: number; h: number;
  toY(v: number): number;
  ticks: { v: number; y: number }[];
  rows: BoardRow[];
  dots: BoardDot[];
  pairLines: [number, number][];   // dot indices: a pair's value in one row to the next row it appears in
  brackets: BoardBracket[];
  zeroY: number | null;
  gap: [number, number] | null;   // the y band where the axis breaks
};

const star = (p: number) => (p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : null);

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const step0 = (hi - lo) / n || 1;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0)!;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

function meanSem(xs: number[]): { mean: number; sem: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : 0;
  return { mean, sem: xs.length > 1 ? sd / Math.sqrt(xs.length) : 0 };
}

/** Gaussian KDE with Scott's bandwidth, as matplotlib's violinplot. */
function violin(xs: number[]): { y: number; half: number }[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const { mean } = meanSem(xs);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(xs.length - 1, 1)) || 1e-9;
  const bw = sd * xs.length ** -0.2;
  const [lo, hi] = [sorted[0]!, sorted[sorted.length - 1]!];
  const pts = Array.from({ length: 41 }, (_, i) => lo + ((hi - lo) * i) / 40);
  const dens = pts.map((y) => xs.reduce((a, x) => a + Math.exp(-0.5 * ((y - x) / bw) ** 2), 0));
  const peak = Math.max(...dens) || 1;
  return pts.map((y, i) => ({ y, half: (dens[i]! / peak) * 0.3 * ROW_W }));
}

/** Two stable numbers in [0, 1) per value. */
function hash2(id: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return [((h >>> 0) % 10007) / 10007, ((Math.imul(h, 2654435761) >>> 0) % 10009) / 10009];
}

/** The violin's half-width at value `v`, interpolated from its profile. */
function widthAt(profile: { y: number; half: number }[], v: number): number {
  const i = profile.findIndex((p) => p.y >= v);
  if (i <= 0) return profile[Math.max(i, 0)]?.half ?? 0;
  const [a, b] = [profile[i - 1]!, profile[i]!];
  return a.half + ((v - a.y) / (b.y - a.y || 1)) * (b.half - a.half);
}

const BREAK_RATIO = 3;

/** The axis break [a, b] when at most 5% of the values sit above a gap three times wider than the span of all below. */
function breakOf(sorted: number[]): [number, number] | null {
  const n = sorted.length;
  let best: [number, number] | null = null;
  let most = BREAK_RATIO;
  for (let k = 1; k <= Math.max(1, Math.floor(n * 0.05)) && k < n - 1; k++) {
    const [a, b] = [sorted[n - k - 1]!, sorted[n - k]!];
    const ratio = (b - a) / (a - sorted[0]!);
    // a zero-span bulk has no scale to break against
    if (a > sorted[0]! && ratio > most) [best, most] = [[a, b], ratio];
  }
  return best;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

export function layoutBoard(result: StatsResult, values: Record<string, StatsValue>, view: ViewConfig): BoardLayout {
  const w = Math.max(3, result.rows.length * ROW_W);
  const h = BOARD_H;
  const outliers = new Set(result.outliers);
  const rowX = (i: number) => -w / 2 + (i + 0.5) * (w / result.rows.length);
  const rows = result.rows.map((r, i) => {
    const ys = r.y.filter((v): v is number => v !== null);
    return {
      x: rowX(i), name: r.name, color: r.color, n: ys.length,
      bar: !view.violin && ys.length ? meanSem(ys) : null,
      violin: view.violin && ys.length >= 2 ? violin(ys) : null,
      median: view.violin && ys.length ? median(ys) : null,
    };
  });

  const hidden = (id: string) => !view.outliers && outliers.has(id);
  const all = result.rows.flatMap((r) => r.y.filter((v, j): v is number => v !== null && !hidden(r.ids[j]!))).sort((a, b) => a - b);
  const extra = rows.flatMap((r) => (r.bar ? [0, r.bar.mean - r.bar.sem, r.bar.mean + r.bar.sem] : []));
  let [lo, hi] = [Math.min(...all, ...extra), Math.max(...all, ...extra)];
  if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
  if (hi === lo) [lo, hi] = [lo - 1, hi + 1];
  const cut = breakOf(all);
  // a break gives the bulk most of the height, the few values above it a strip at the top
  const [a, b] = cut ?? [hi, hi];
  const low = Math.max(a, ...extra.filter((v) => v < b));
  const pad = (low - lo) * 0.05;
  const up = Math.max((hi - b) * 0.1, pad);
  const knots: [number, number][] = cut
    ? [[lo - pad, -h / 2], [low + pad, h * 0.28], [b - up, h * 0.34], [hi + up, h / 2]]
    : [[lo - pad, -h / 2], [hi + pad, h / 2]];
  const toY = (v: number) => {
    const i = Math.min(Math.max(knots.findIndex(([k]) => k >= v), 1), knots.length - 1);
    const [[v0, y0], [v1, y1]] = [knots[i - 1]!, knots[i]!];
    return y0 + ((v - v0) / (v1 - v0)) * (y1 - y0);
  };
  const ticks = cut ? [...niceTicks(lo - pad, low + pad), ...new Set(all.filter((v) => v >= b).map((v) => Number(v.toPrecision(3))))]
    : niceTicks(lo - pad, hi + pad);

  // dots fill their row's body: spread over a disc as wide as the density at their value, so dense parts look dense
  const profiles = result.rows.map((r) => {
    const ys = r.y.filter((v): v is number => v !== null);
    return ys.length >= 2 ? violin(ys) : null;
  });
  const dots: BoardDot[] = [];
  result.rows.forEach((r, ri) => r.ids.forEach((id, j) => {
    const v = r.y[j];
    if (v === null || v === undefined || hidden(id)) return;
    const [u, a] = hash2(id);
    const radius = (profiles[ri] ? widthAt(profiles[ri]!, v) : 0.06 * ROW_W) * 0.9 * Math.sqrt(u);
    dots.push({ id, x: rows[ri]!.x + radius * Math.cos(2 * Math.PI * a), y: toY(v), z: radius * Math.sin(2 * Math.PI * a), row: ri, outlier: outliers.has(id) });
  }));

  // a pair's dots joined row to row, wherever the pair is measured again
  const repeated = repeatedPairs(result, values);
  const lastOf = new Map<string, number>();
  const pairLines: [number, number][] = [];
  dots.forEach((d, i) => {
    const pair = values[d.id]?.pair;
    if (!pair || !repeated.has(pair)) return;
    const prev = lastOf.get(pair);
    if (prev !== undefined && dots[prev]!.row < d.row) pairLines.push([prev, i]);
    lastOf.set(pair, i);
  });

  const names = result.rows.map((r) => r.name);
  const starred = (view.sig_brackets ? result.brackets : [])
    .map((b) => ({ a: names.indexOf(b.a), b: names.indexOf(b.b ?? b.a), s: star(b.p_adj) }))
    .filter((b) => b.a >= 0 && b.b >= 0 && b.s)
    .sort((p, q) => Math.abs(p.a - p.b) - Math.abs(q.a - q.b));
  const levels: [number, number][][] = [];
  const brackets = starred.map(({ a, b, s }) => {
    const [x0, x1] = [rowX(Math.min(a, b)), rowX(Math.max(a, b))];
    let level = levels.findIndex((row) => row.every(([l, r]) => x1 < l - 0.1 || x0 > r + 0.1));
    if (level < 0) level = levels.push([]) - 1;
    levels[level]!.push([x0, x1]);
    return { x0, x1, level, star: s! };
  });

  return {
    w, h, toY, rows, dots, pairLines, brackets,
    ticks: ticks.map((v) => ({ v, y: toY(v) })),
    zeroY: (result.one_sample || (lo < 0 && hi > 0)) ? toY(0) : null,
    gap: cut ? [h * 0.28, h * 0.34] : null,
  };
}
