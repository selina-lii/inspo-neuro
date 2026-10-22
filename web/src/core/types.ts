// Records as the Python API sends them. Pair ref/tgt are neuron positions (idx); neuron tags use ids.

export type Neuron = {
  idx: number;
  id: number;
  x: number;
  y: number;
  shank: number | null;
  probe_shank: number | null;   // the shank whose geometry `Shank` gives
  channel: number | null;
  type: string;
  area: string;
  rate: number;
  groups: string[];
};

export type FitSummary = {
  fitted: boolean;
  confident: boolean;
  label?: string;
  latency?: number | null;
  fwhm?: number | null;
  n_peaks?: number;
  hand?: boolean;
};

export type Link = {
  i: number;   // position in the session's link list: per-segment arrays are in this order
  ref: number;
  tgt: number;
  type: string;
  ei: "E" | "I";
  state: "sel" | "unsel" | "del";
  groups: string[];
  rules: string[];
  strength: number;
  fit: FitSummary | null;
};

export type Acgs = { ref: number[] | null; tgt: number[] | null };

export type Trace = { lags: number[]; ccg: number[]; baseline: number[]; p?: number[]; pc?: number[]; acgs?: Acgs };

export type FitPeak = { center: number; fwhm: number; edges: [number, number]; confident: boolean; called: boolean; mono: boolean };

export type PairDetail = {
  type: string;
  lowres: Trace;
  highres: Trace;
  fit: FitSummary & { lags?: number[]; curve?: number[]; peaks?: FitPeak[] };
};

/** A probe shank's extent in probe units; `inferred` when the dataset has no probe and the neurons outline it. */
export type Shank = { id: number; x0: number; x1: number; y0: number; y1: number; inferred: boolean };

export type LayoutKind = "physical" | "embedding" | "axes" | "manual";

export type Point = { x: number; y: number };

export type Point3 = { x: number; y: number; z: number };

export type Selection = { neurons: Set<number>; links: Set<string> };

/** A named region of the map; its name is the tag that dropping neurons into it applies. Centre-based box, world units. */
export type Area = { id: string; name: string; x: number; y: number; w: number; h: number };

export const linkKey = (ref: number, tgt: number): string => `${ref}-${tgt}`;

export type Segment = { name: string; intervals: [number, number][]; start: number; stop: number; duration: number };

export type SegLinks = { segment: string; strength: number[]; cs: (number | null)[]; on: boolean[]; norms?: string };   // norms: what the CS was measured with, set on arrival

export type TagSpec = { name: string; source: string; values: (number | null)[]; labels: (string | null)[] | null; colors: Record<string, string> };

export type NeuronValues = {
  rates: Record<string, (number | null)[]>;
  specs: TagSpec[];
  place: Record<string, { frmax: (number | null)[]; is_place: boolean[] }>;
};

/** A pair group's registry entry, as the Qt GUI keeps it: its hotkey tags the focused pair. */
export type GroupMeta = { hotkey: string; color: string; notes: string };

/** A stored extend unit: a wider CCG window saved from the Qt panel. */
export type ExtendUnit = { name: string; window_ms: number; bin_ms: number; n_computed: number; segment: string };
