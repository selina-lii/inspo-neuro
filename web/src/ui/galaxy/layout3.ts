// Neuron and probe positions in 3D units, from a session's neurons, links and shanks. Pure: shared by the network and its stack.
import { neuronMetric, normalize, physicalFrame } from "../../core/derive";
import type { LayoutKind, Link, Neuron, Point, Point3, Shank } from "../../core/types";

export const UNIT = 100;   // layout units per 3D unit

export type Probe = { shank: Shank; x: number; y0: number; y1: number; w: number };

/** Each shank as it sits in the physical layout, in 3D units. */
export function probes(neurons: Neuron[], shanks: Shank[], spacing: number): Probe[] {
  const base = physicalFrame(neurons, shanks);
  const frame = (x: number, y: number) => {   // the physical layout's own stretch, so probes sit under their neurons
    const p = base(x, y);
    return { x: p.x * spacing, y: p.y * Math.sqrt(spacing) };
  };
  // one probe's shanks are one length: a shank's own extent (inferred from its few neurons) would draw it short
  const [y0, y1] = [Math.min(...shanks.flatMap((s) => [s.y0, s.y1])), Math.max(...shanks.flatMap((s) => [s.y0, s.y1]))];
  return shanks.map((s) => {
    const a = frame(s.x0, y0);
    const b = frame(s.x1, y1);
    return { shank: s, x: (a.x + b.x) / 2 / UNIT, y0: Math.min(-a.y, -b.y) / UNIT, y1: Math.max(-a.y, -b.y) / UNIT, w: Math.max(Math.abs(b.x - a.x) / UNIT, 0.12) };
  });
}

/** Layout positions in 3D units: the 3D embedding, or the 2D layout lifted by a metric. In the physical layout a shank's
 * neurons stay packed sideways on their probe until it is expanded; their height always follows the metric. */
export type Layout3Input = { layout: LayoutKind; embedding3: Point3[] | null; positions: Point[]; neurons: Neuron[]; links: Link[]; shanks: Shank[]; zMetric: string; spacing: number; lift?: number };   // lift: share of the metric height kept (a stack flattens its layers)

export function positions3(input: Layout3Input, expanded: Set<number>): Point3[] {
  const { layout, embedding3, positions, neurons, links, zMetric, spacing, shanks, lift = 1 } = input;
  if (layout === "embedding" && embedding3?.length === neurons.length) {
    const xy = normalize(embedding3.map((p) => ({ x: p.x, y: p.y })), 1300);
    const zs = embedding3.map((p) => p.z);
    const [z0, z1] = [Math.min(...zs), Math.max(...zs)];
    const span = (Math.max(...embedding3.map((p) => p.x)) - Math.min(...embedding3.map((p) => p.x))) || 1;
    return xy.map((p, i) => ({ x: p.x / UNIT, y: -p.y / UNIT, z: (((zs[i]! - (z0 + z1) / 2) / span) * 1300) / UNIT }));
  }
  const zs = neuronMetric(zMetric, neurons, links);
  const [z0, z1] = [Math.min(...zs), Math.max(...zs)];
  const lifted = (i: number) => ((zs[i]! - (z0 + z1) / 2) / Math.max(z1 - z0, 1e-9)) * 8 * spacing * lift;
  if (layout !== "physical") return positions.map((p, i) => ({ x: p.x / UNIT, y: -p.y / UNIT, z: lifted(i) }));
  const probeX = new Map(probes(neurons, shanks, spacing).map((p) => [p.shank.id, p.x]));
  return positions.map((p, i) => {
    const shank = neurons[i]!.probe_shank;
    const home = shank === null ? undefined : probeX.get(shank);
    if (home === undefined || (shank !== null && expanded.has(shank))) return { x: p.x / UNIT, y: -p.y / UNIT, z: lifted(i) };
    return { x: home + (p.x / UNIT - home) * 0.25, y: -p.y / UNIT, z: lifted(i) };
  });
}
