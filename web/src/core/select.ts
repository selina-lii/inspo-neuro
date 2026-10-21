// The 3D selection: picked3 leads, more3 holds what Shift-click added.
import type { Picked3, State } from "./store";

export const same3 = (a: Picked3, b: Picked3) => a.kind === b.kind && a.id === b.id;

export const selection3 = (s: State): Picked3[] => (s.picked3 ? [s.picked3, ...s.more3.filter((m) => !same3(m, s.picked3!))] : []);

export const selected3 = (s: State, kind: Picked3["kind"], id: string) => selection3(s).some((p) => p.kind === kind && p.id === id);
