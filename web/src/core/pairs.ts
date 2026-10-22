// The pair list's order and stepping: pure, so the keys and the list agree.
import type { Link, Neuron } from "./types";

type Signed = { ei: "E" | "I"; strength: number };

/** Strongest first, over *xs*: an inhibitory pair is stronger the more negative; E and I mixed rank by size. */
export function strongestFirst<T extends Signed>(xs: T[]): (a: T, b: T) => number {
  const kinds = new Set(xs.map((x) => x.ei));
  const strong = (x: T) => (kinds.size > 1 ? Math.abs(x.strength) : kinds.has("I") ? -x.strength : x.strength);
  return (a, b) => strong(b) - strong(a);
}

export function orderedPairs(links: Link[], neurons: Neuron[], order: "strength" | "ref" | "type"): Link[] {
  const id = (i: number) => neurons[i]?.id ?? i;
  const byRef = (a: Link, b: Link) => id(a.ref) - id(b.ref) || id(a.tgt) - id(b.tgt);
  if (order === "ref") return [...links].sort(byRef);
  const strong = strongestFirst(links);
  if (order === "type") return [...links].sort((a, b) => a.type.localeCompare(b.type) || strong(a, b));
  return [...links].sort(strong);
}

/** The pair *step* places after (or before) the focused one; the first pair when none is focused. */
export function stepPair(list: Link[], focus: { ref: number; tgt: number } | null, step: number): Link | undefined {
  if (!list.length) return undefined;
  const at = focus ? list.findIndex((l) => l.ref === focus.ref && l.tgt === focus.tgt) : -1;
  if (at < 0) return list[step > 0 ? 0 : list.length - 1];
  return list[Math.min(Math.max(at + step, 0), list.length - 1)];
}
