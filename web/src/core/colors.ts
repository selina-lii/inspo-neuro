// Colour modes for neurons and links, shared by the 2D and 3D views and the legend. Pure: no React, no drawing.
import type { LinkColor, MapInstance, State } from "./store";
import type { Link, SegLinks } from "./types";

export const TYPE_COLORS: Record<string, string> = {
  "E PYR→PYR": "#ff5a36",
  "E PYR→INT": "#ffb020",
  "I INT→INT": "#2f8cff",
  "I INT→PYR": "#a46bff",
};

export const AREA_COLORS: Record<string, string> = { CA1: "#3fbf6b", CA3: "#14b8c4", RSC: "#e05aa8", DG: "#c9b13b" };

export const areaColor = (area: string): string => AREA_COLORS[area] ?? "#9aa0a6";

/** The focused pair's highlight: a fluorescent pink nothing else on the map uses. */
export const PICK_COLOR = "#ff1dce";

// pseudocolouring palettes: pyramidal cells warm, interneurons cold; interneurons are few, so each gets its own hue
const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360}, ${s}%, ${l}%)`;
// hues stepped by the golden angle inside each family's arc, with lightness and saturation cycling, so neighbours differ
const family = (h0: number, arc: number, n: number) =>
  Array.from({ length: n }, (_, i) => hsl(h0 + ((i * 137.508) % arc), [85, 65, 95, 75][i % 4]!, [48, 62, 38, 72, 55][i % 5]!));
const WARM = family(-40, 105, 40);   // magenta-red through orange to yellow
const COLD = family(160, 140, 24);   // green-cyan through blue to violet

export const NEURON_TYPE_COLORS: Record<string, string> = { pyr: "#e05555", int: "#3a6df0" };
export const neuronTypeColor = (type: string): string => (type === "pyr" ? NEURON_TYPE_COLORS.pyr! : type.startsWith("int") ? NEURON_TYPE_COLORS.int! : MISSING);

const GROUP_PALETTE = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4", "#f032e6", "#bfef45", "#469990", "#9a6324", "#800000", "#000075"];

/** The groups a person applied: NeuroPy's '__special_' markers (classifier admissions, slideshow picks) are bookkeeping. */
export const realGroups = (groups: string[]): string[] => groups.filter((g) => !g.startsWith("__special_"));

/** A pair group's colour: the one set in the Qt GUI, else a stable pick from a palette. */
export function groupColor(s: State, group: string): string {
  return s.groupMeta[group]?.color || paletteColor(group);
}

/** A stable palette colour for a name. */
export function paletteColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GROUP_PALETTE[h % GROUP_PALETTE.length]!;
}

const SEQUENTIAL = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"];
const DIVERGING = ["#2166ac", "#67a9cf", "#e8e8e8", "#ef8a62", "#b2182b"];
export const MISSING = "#8a8f98";

function hex(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function ramp(stops: string[], t: number): string {
  const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  const [a, b] = [hex(stops[i]!), hex(stops[i + 1]!)];
  const f = x - i;
  return "#" + a.map((v, k) => Math.round(v + (b[k]! - v) * f).toString(16).padStart(2, "0")).join("");
}

/** Sequential colour for t in [0, 1]. */
export const sequential = (t: number): string => ramp(SEQUENTIAL, t);

/** Diverging colour for t in [-1, 1]: blue below zero, red above. */
export const diverging = (t: number): string => ramp(DIVERGING, (t + 1) / 2);

export type Legend =
  | { kind: "categories"; title: string; entries: [string, string][] }
  | { kind: "gradient"; title: string; min: string; max: string; diverging: boolean };

// ── neurons ────────────────────────────────────────────────────────────

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

function quantileRange(values: (number | null)[], log: boolean): [number, number] {
  const xs = values.filter(finite).map((v) => (log ? Math.log10(Math.max(v, 1e-3)) : v)).sort((a, b) => a - b);
  if (!xs.length) return [0, 1];
  return [xs[Math.floor(xs.length * 0.02)]!, xs[Math.floor(xs.length * 0.98)] ?? xs[xs.length - 1]!];
}

/** Each neuron's colour and the legend for the mode `s.neuronColor`. */
export function neuronColors(s: State): { colors: string[]; legend: Legend } {
  const mode = s.neuronColor;
  const v = s.neuronValues;
  const n = s.neurons.length;
  const area = (): { colors: string[]; legend: Legend } => ({
    colors: s.neurons.map((x) => areaColor(x.area)),
    legend: { kind: "categories", title: "region", entries: [...new Set(s.neurons.map((x) => x.area))].map((a) => [a, areaColor(a)]) },
  });
  if (mode === "random") {
    // pyramidal neighbours in id order get far-apart warm entries (a multiplicative hash spreads them); interneurons take cold hues in turn
    let nInt = 0;
    return {
      colors: s.neurons.map((x) => (x.type === "pyr" ? WARM[(Math.imul(x.idx + 1, 2654435761) >>> 0) % WARM.length]! : COLD[nInt++ % COLD.length]!)),
      legend: { kind: "categories", title: "per neuron", entries: [["pyr: warm", WARM[0]!], ["int: cold", COLD[0]!]] },
    };
  }
  if (mode === "type") {
    return {
      colors: s.neurons.map((x) => neuronTypeColor(x.type)),
      legend: { kind: "categories", title: "type", entries: [["pyr", NEURON_TYPE_COLORS.pyr!], ["int", NEURON_TYPE_COLORS.int!]] },
    };
  }
  if (mode === "area" || !v) return area();
  const [kind, arg = ""] = mode.split(/:(.*)/s) as [string, string?];
  const gradient = (values: (number | null)[], title: string, log: boolean) => {
    const [lo, hi] = quantileRange(values, log);
    const fmt = (x: number) => (log ? 10 ** x : x).toPrecision(2);
    return {
      colors: values.map((x) => (finite(x) ? sequential(((log ? Math.log10(Math.max(x, 1e-3)) : x) - lo) / Math.max(hi - lo, 1e-9)) : MISSING)),
      legend: { kind: "gradient", title, min: fmt(lo), max: fmt(hi), diverging: false } as Legend,
    };
  };
  if (kind === "rate") return gradient(v.rates[arg] ?? new Array(n).fill(null), `firing rate in ${arg} (Hz)`, true);
  if (kind === "ratio") {
    const [a = "", b = ""] = arg.split("/");
    const ra = v.rates[a];
    const rb = v.rates[b];
    const logRatio = s.neurons.map((_, i) => (ra && rb && finite(ra[i]) && finite(rb[i]) && rb[i]! > 0 && ra[i]! > 0 ? Math.log2(ra[i]! / rb[i]!) : null));
    const span = Math.max(1, ...logRatio.filter(finite).map(Math.abs).sort((x, y) => x - y).slice(-Math.ceil(n * 0.05)));
    return {
      colors: logRatio.map((x) => (finite(x) ? diverging(x / span) : MISSING)),
      legend: { kind: "gradient", title: `rate ${a} ÷ ${b}`, min: `${(2 ** -span).toPrecision(2)}×`, max: `${(2 ** span).toPrecision(2)}×`, diverging: true },
    };
  }
  if (kind === "spec" || kind === "specv") {
    const spec = v.specs.find((x) => x.name === arg);
    if (!spec) return area();
    if (kind === "specv" || !spec.labels) return gradient(spec.values, `${spec.name} value`, false);
    const labels = spec.labels;
    return {
      colors: labels.map((l) => (l ? spec.colors[l] ?? MISSING : MISSING)),
      legend: { kind: "categories", title: spec.name, entries: Object.entries(spec.colors) },
    };
  }
  if (kind === "place") {
    const place = v.place[arg];
    if (!place) return area();
    return {
      colors: place.is_place.map((p) => (p ? "#e0a020" : "#5b6270")),
      legend: { kind: "categories", title: `place cell in ${arg}`, entries: [["place cell", "#e0a020"], ["not", "#5b6270"]] },
    };
  }
  return area();
}

// ── links ──────────────────────────────────────────────────────────────

export type LinkStyle = { color: string; color2?: string; alpha: number; width: number; dashed: boolean };

// one colour pass per neuron colouring, not per link
let endColors: { key: unknown[]; colors: string[] } | null = null;
function neuronColorsOf(s: State): string[] {
  const key = [s.neurons, s.neuronColor, s.neuronValues];
  if (!endColors || endColors.key.some((k, i) => k !== key[i])) endColors = { key, colors: neuronColors(s).colors };
  return endColors.colors;
}

const scales = new WeakMap<SegLinks, number>();

/** A measure's typical size in one segment (90th percentile of |value|), so widths and colours mean the same across measures. */
function scaleOf(seg: SegLinks): number {
  if (!scales.has(seg)) {
    const xs = seg.cs.filter((v): v is number => v !== null).map(Math.abs).sort((a, b) => a - b);
    scales.set(seg, xs[Math.floor(xs.length * 0.9)] || 1);
  }
  return scales.get(seg)!;
}

/** Strength (in the chosen measure, scaled so 1 is strong) and on/off of a link in a segment; the session-wide excess stands in until the segment is loaded. */
export function inSegment(s: State, link: Link, segment: string): { strength: number; on: boolean | null; raw: number } {
  const seg = s.segLinks[segment];
  if (!seg) return { strength: link.strength / 12, on: null, raw: link.strength };
  const on = seg.on[link.i] ?? null;
  if (s.encoding.measure === "cs") {
    const raw = seg.cs[link.i] ?? 0;
    return { strength: (link.ei === "I" ? -raw : raw) / scaleOf(seg), on, raw };
  }
  const raw = seg.strength[link.i] ?? link.strength;
  return { strength: raw / 12, on, raw };
}

const widthOf = (strength: number) => Math.min(Math.max(strength, 0), 1);

/** How one map draws one link under the link colour mode and the chosen encodings. */
export function linkStyle(s: State, map: MapInstance, link: Link): LinkStyle {
  const style = colouredStyle(s, map, link);
  const here = inSegment(s, link, map.segment);
  const dash = s.encoding.dash;
  const dashed = dash === "uncertain" ? Boolean(link.fit?.fitted && !link.fit.confident) : dash === "off" ? here.on === false : dash === "unselected" ? link.state !== "sel" : false;
  return { ...style, alpha: style.alpha * s.linkAlpha, dashed, width: s.encoding.width === "constant" ? 0.35 : style.width };
}

function colouredStyle(s: State, map: MapInstance, link: Link): LinkStyle {
  const mode: LinkColor = s.linkColor;
  const here = inSegment(s, link, map.segment);
  const dashed = false;
  const off = here.on === false;
  if (mode.kind === "strength") {
    return { color: sequential(widthOf(here.strength)), alpha: off ? 0.25 : 0.95, width: widthOf(here.strength), dashed };
  }
  if (mode.kind === "change") {
    const a = inSegment(s, link, mode.a).strength;
    const b = inSegment(s, link, mode.b).strength;
    const d = (b - a) / Math.max(Math.abs(a), Math.abs(b), 0.25);
    return { color: diverging(d), alpha: 0.95, width: widthOf(Math.max(a, b)), dashed };
  }
  if (mode.kind === "onoff") {
    const a = inSegment(s, link, mode.a).on;
    const b = inSegment(s, link, mode.b).on;
    const [color, alpha] = a && b ? ["#9aa0a6", 0.7] : !a && b ? ["#1fa64a", 0.95] : a && !b ? ["#d9342b", 0.95] : ["#c9ccd1", 0.12];
    return { color, alpha, width: widthOf(here.strength), dashed: false };
  }
  if (mode.kind === "ends") {
    const colors = neuronColorsOf(s);
    return { color: colors[link.ref] ?? MISSING, color2: colors[link.tgt] ?? MISSING, alpha: off ? 0.3 : 0.95, width: widthOf(here.strength), dashed };
  }
  if (mode.kind === "group") {
    // with groups picked in the filter, a link takes the colour of the first picked group it is in
    const g = realGroups(link.groups).find((x) => !s.filters.groups.size || s.filters.groups.has(x));
    return { color: g ? groupColor(s, g) : MISSING, alpha: g ? (off ? 0.3 : 0.95) : 0.18, width: widthOf(here.strength), dashed };
  }
  return { color: TYPE_COLORS[link.type] ?? "#999", alpha: off ? 0.22 : 0.92, width: widthOf(here.strength), dashed };
}

export function linkLegend(s: State): Legend {
  const m = s.linkColor;
  if (m.kind === "strength") return { kind: "gradient", title: s.encoding.measure === "cs" ? "CS" : "strength", min: "0", max: "strong", diverging: false };
  if (m.kind === "change") return { kind: "gradient", title: `${m.a} → ${m.b}`, min: "weaker", max: "stronger", diverging: true };
  if (m.kind === "onoff") return { kind: "categories", title: `on: ${m.a} → ${m.b}`, entries: [["on → on", "#9aa0a6"], ["off → on", "#1fa64a"], ["on → off", "#d9342b"], ["off → off", "#c9ccd1"]] };
  if (m.kind === "ends") return { kind: "categories", title: "ref → tgt colour", entries: [] };
  if (m.kind === "group") {
    const shown = s.filters.groups.size ? [...s.filters.groups] : [...new Set(s.links.flatMap((l) => realGroups(l.groups)))].sort();
    return { kind: "categories", title: "group", entries: shown.slice(0, 16).map((g) => [g, groupColor(s, g)]) };
  }
  return { kind: "categories", title: "type", entries: Object.entries(TYPE_COLORS) };
}
