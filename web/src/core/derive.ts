// Pure derivations: visible links, neuron metrics, layout positions.
import type { Filters, State } from "./store";
import type { Area, Link, Neuron, Point, Shank } from "./types";

/** A pair the same-channel / same-shank filters hide, whatever its link's other properties. */
export function pairHidden(filters: Filters, neurons: Neuron[], ref: number, tgt: number): boolean {
  const same = (f: (n: Neuron) => number | null) => {
    const a = neurons[ref];
    const b = neurons[tgt];
    return Boolean(a && b && f(a) !== null && f(a) === f(b));
  };
  return (filters.hideSameChannel && same((n) => n.channel)) || (filters.hideSameShank && same((n) => n.probe_shank));
}

export function visibleLinks(links: Link[], filters: Filters, neurons: Neuron[]): Link[] {
  return links.filter(
    (link) =>
      !pairHidden(filters, neurons, link.ref, link.tgt) &&
      filters.types.has(link.type) &&
      filters.states.has(link.state) &&
      (!filters.groups.size ||
        (filters.groupMode === "all" ? [...filters.groups].every((g) => link.groups.includes(g)) : link.groups.some((g) => filters.groups.has(g)))) &&
      (!filters.rule || link.rules.includes(filters.rule)) &&
      (!filters.confidentOnly || Boolean(link.fit?.confident)) &&
      link.strength >= filters.minStrength,
  );
}

export const METRICS = ["rate", "log rate", "x", "y", "out strength", "in strength", "out links", "in links"] as const;

export function neuronMetric(name: string, neurons: Neuron[], links: Link[]): number[] {
  const out = new Array<number>(neurons.length).fill(0);
  const add = (pick: (l: Link) => number, value: (l: Link) => number) => {
    for (const link of links) out[pick(link)]! += value(link);
  };
  const positive = (l: Link) => Math.max(l.strength, 0);
  if (name === "rate") return neurons.map((n) => n.rate);
  if (name === "log rate") return neurons.map((n) => Math.log10(Math.max(n.rate, 1e-3)));
  if (name === "x") return neurons.map((n) => n.x);
  if (name === "y") return neurons.map((n) => n.y);
  if (name === "out strength") add((l) => l.ref, positive);
  if (name === "in strength") add((l) => l.tgt, positive);
  if (name === "out links") add((l) => l.ref, () => 1);
  if (name === "in links") add((l) => l.tgt, () => 1);
  return out;
}

/** Fit points into a `width` × `height` box centred on 0; with `keepAspect` the tighter side sets one scale. */
export function normalize(points: Point[], width = 1000, keepAspect = true, height = width): Point[] {
  if (!points.length) return points;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = width / Math.max(x1 - x0, 1e-9);
  const sy = height / Math.max(y1 - y0, 1e-9);
  const s = Math.min(sx, sy);
  return points.map((p) => ({
    x: (p.x - (x0 + x1) / 2) * (keepAspect ? s : sx),
    y: (p.y - (y0 + y1) / 2) * (keepAspect ? s : sy),
  }));
}

/** Neurons that share a site spread on a small ring, so each card stays reachable. */
export function spreadShared(points: Point[], radius: number): Point[] {
  const bySite = new Map<string, number[]>();
  points.forEach((p, i) => {
    const site = `${Math.round(p.x)},${Math.round(p.y)}`;
    bySite.set(site, [...(bySite.get(site) ?? []), i]);
  });
  const out = points.map((p) => ({ ...p }));
  for (const members of bySite.values()) {
    if (members.length < 2) continue;
    const r = radius * Math.sqrt(members.length);
    members.forEach((i, k) => {
      const angle = (2 * Math.PI * k) / members.length;
      out[i] = { x: points[i]!.x + r * Math.cos(angle), y: points[i]!.y + r * Math.sin(angle) };
    });
  }
  return out;
}

/** Probe units → layout units: depth runs down the screen, x stretched because probes are far taller than wide. */
export function physicalFrame(neurons: Neuron[], shanks: Shank[]): (x: number, y: number) => Point {
  const xs = [...neurons.map((n) => n.x), ...shanks.flatMap((s) => [s.x0, s.x1])];
  const ys = [...neurons.map((n) => n.y), ...shanks.flatMap((s) => [s.y0, s.y1])];
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = 900 / Math.max(x1 - x0, 1e-9);
  const sy = 1400 / Math.max(y1 - y0, 1e-9);
  return (x, y) => ({ x: (x - (x0 + x1) / 2) * sx, y: -(y - (y0 + y1) / 2) * sy });
}

/** Neurons of one shank fan out sideways from their probe until none is closer than `gap` to another. */
function fanOut(points: Point[], members: number[], gap: number): void {
  const placed: Point[] = [];
  for (const i of [...members].sort((a, b) => points[a]!.y - points[b]!.y)) {
    const p = points[i]!;
    for (let k = 0; ; k++) {
      const x = p.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * gap;
      if (!placed.some((q) => Math.abs(q.x - x) < gap && Math.abs(q.y - p.y) < gap)) {
        points[i] = { x, y: p.y };
        placed.push(points[i]!);
        break;
      }
    }
  }
}

/** Probe space, each shank's neurons fanned out around it; `spacing` scales the gap. */
export function physicalLayout(neurons: Neuron[], shanks: Shank[], spacing = 1): Point[] {
  const frame = physicalFrame(neurons, shanks);
  const points = neurons.map((n) => {
    const p = frame(n.x, n.y);
    return { x: p.x * spacing, y: p.y * Math.sqrt(spacing) };   // spacing pulls shanks apart more than it stretches depth
  });
  const byShank = new Map<number | null, number[]>();
  neurons.forEach((n, i) => byShank.set(n.probe_shank, [...(byShank.get(n.probe_shank) ?? []), i]));
  for (const members of byShank.values()) fanOut(points, members, 12 * spacing);
  return points;
}

export function axesLayout(neurons: Neuron[], links: Link[], x: string, y: string, spacing = 1): Point[] {
  const xs = neuronMetric(x, neurons, links);
  const ys = neuronMetric(y, neurons, links);
  return spreadShared(normalize(xs.map((v, i) => ({ x: v, y: -ys[i]! })), 1200 * spacing, false, 900 * spacing), 6 * spacing);
}

export function lerpPoints(a: Point[], b: Point[], t: number): Point[] {
  if (a.length !== b.length) return b;
  const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  return b.map((p, i) => ({ x: a[i]!.x + (p.x - a[i]!.x) * e, y: a[i]!.y + (p.y - a[i]!.y) * e }));
}

export function inArea(p: Point, area: Area): boolean {
  return Math.abs(p.x - area.x) <= area.w / 2 && Math.abs(p.y - area.y) <= area.h / 2;
}

export const linksAmong = (links: Link[], neurons: Set<number>): Link[] => links.filter((l) => neurons.has(l.ref) && neurons.has(l.tgt));

/** The neighbourhood the view narrows to: in minesweeper mode the opened neurons and their first-degree neighbours, else
 * a focused neuron and its own; null when nothing narrows it. Links kept touch an opened (or the focused) neuron. */
export function neighbourhood(s: State, shown: Link[]): { neurons: Set<number>; keep(l: Link): boolean } | null {
  const centres = s.sweep.on && s.sweep.open.size ? s.sweep.open : s.focus?.kind === "neuron" ? new Set([s.focus.idx]) : null;
  if (!centres) return null;
  const keep = (l: Link) => centres.has(l.ref) || centres.has(l.tgt);
  const neurons = new Set(centres);
  for (const l of shown) if (keep(l)) neurons.add(l.ref).add(l.tgt);
  return { neurons, keep };
}
