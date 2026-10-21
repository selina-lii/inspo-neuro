// The pair list's order and stepping: pure, so the keys and the list agree.
import type { Link, Neuron } from "./types";

export function orderedPairs(links: Link[], neurons: Neuron[], order: "strength" | "ref" | "type"): Link[] {
  const id = (i: number) => neurons[i]?.id ?? i;
  const byRef = (a: Link, b: Link) => id(a.ref) - id(b.ref) || id(a.tgt) - id(b.tgt);
  if (order === "ref") return [...links].sort(byRef);
  if (order === "type") return [...links].sort((a, b) => a.type.localeCompare(b.type) || b.strength - a.strength);
  return [...links].sort((a, b) => b.strength - a.strength);
}

/** The pair *step* places after (or before) the focused one; the first pair when none is focused. */
export function stepPair(list: Link[], focus: { ref: number; tgt: number } | null, step: number): Link | undefined {
  if (!list.length) return undefined;
  const at = focus ? list.findIndex((l) => l.ref === focus.ref && l.tgt === focus.tgt) : -1;
  if (at < 0) return list[step > 0 ? 0 : list.length - 1];
  return list[Math.min(Math.max(at + step, 0), list.length - 1)];
}
