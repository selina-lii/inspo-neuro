// The only module that knows the API's URLs.
import type { WorkspaceDoc } from "../workspaceActions";
import type { Area, ExtendUnit, GroupMeta, Link, Neuron, NeuronValues, PairDetail, Point, SegLinks, Segment, Shank } from "../core/types";
import type { PairRow } from "../core/stack";
import { fetchApi } from "./loading";

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchApi(path, { headers: { "Content-Type": "application/json" }, ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

export type JitterResult = { j_avg: number[]; j_lo: number[]; j_hi: number[]; bands: Record<string, number[]> | null; j_pval: number | null };
export type JitterStatus = { status: "none" | "running" | "done" | "error"; result?: JitterResult; error?: string };

export type FitRow = { ref: number; tgt: number } & NonNullable<Link["fit"]>;
export type FitProgress = { done: number; total: number; running: boolean; fits: FitRow[] };

export type StackPayload = {
  neurons: Neuron[]; links: Link[]; shanks: Shank[]; hours: Record<string, number>; seg_links: Record<string, SegLinks>;
  lags?: number[]; traces: Record<string, Record<string, PairRow>>;
};

export const api = {
  pick: (query: object) => call<{ pairs: string[] }>("/pick", { method: "POST", body: JSON.stringify(query) }),
  stack: (s: string, segments: string[], pairs: string[], res: string, norms: string[], light = false) =>
    call<StackPayload>(`/stack/${encodeURIComponent(s)}?segments=${encodeURIComponent(segments.join(","))}&pairs=${pairs.join(",")}&res=${res}&norms=${norms.join(",")}&light=${light}`),
  projects: () => call<{ projects: string[]; open: string | null }>("/projects"),
  open: (name: string, discard = false) => call<{ name: string; sessions: string[] }>(`/open/${encodeURIComponent(name)}?discard=${discard}`, { method: "POST" }),
  workspaces: () => call<{ names: string[] }>("/workspaces"),
  workspace: (name: string) => call<WorkspaceDoc>(`/workspaces/${encodeURIComponent(name)}`),
  saveWorkspace: (name: string, doc: WorkspaceDoc) => call<{ ok: boolean }>(`/workspaces/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify(doc) }),
  renameWorkspace: (name: string, to: string) => call<{ ok: boolean }>(`/workspaces/${encodeURIComponent(name)}/rename`, { method: "POST", body: JSON.stringify({ to }) }),
  deleteWorkspace: (name: string) => call<{ ok: boolean }>(`/workspaces/${encodeURIComponent(name)}`, { method: "DELETE" }),
  unsaved: () => call<{ unsaved: number }>("/unsaved"),
  save: () => call<{ unsaved: number }>("/save", { method: "POST" }),
  sessions: () => call<{ name: string; sessions: string[]; pair_groups: string[]; neuron_groups: string[]; group_meta: Record<string, GroupMeta> }>("/sessions"),
  session: (s: string) => call<{ neurons: Neuron[]; links: Link[]; shanks: Shank[] }>(`/session/${encodeURIComponent(s)}`),
  layout: (s: string, kind: string, seed = 0) =>
    call<{ xy: [number, number][] | null }>(`/layout/${encodeURIComponent(s)}/${kind}?seed=${seed}`),
  embedding3: (s: string, seed = 0) => call<{ xy: [number, number, number][] }>(`/layout/${encodeURIComponent(s)}/embedding?seed=${seed}&dims=3`),
  saveManual: (s: string, xy: [number, number][]) =>
    call<{ ok: boolean }>(`/layout/${encodeURIComponent(s)}/manual`, { method: "PUT", body: JSON.stringify({ xy }) }),
  areas: (s: string) => call<{ areas: Area[] }>(`/areas/${encodeURIComponent(s)}`),
  saveAreas: (s: string, areas: Area[]) =>
    call<{ ok: boolean }>(`/areas/${encodeURIComponent(s)}`, { method: "PUT", body: JSON.stringify({ areas }) }),
  traces: (s: string, seg: string) =>
    call<{ pairs: [number, number][]; lowres_lags: number[]; highres_lags: number[]; n_neurons: number }>(`/traces/${encodeURIComponent(s)}?segment=${encodeURIComponent(seg)}`),
  tracesBin: async (s: string, res: string, seg: string): Promise<Float32Array> => {
    const response = await fetchApi(`/traces/${encodeURIComponent(s)}/${res}.bin?segment=${encodeURIComponent(seg)}`);
    if (!response.ok) throw new Error(response.statusText);
    return new Float32Array(await response.arrayBuffer());
  },
  fit: (s: string, ref: number, tgt: number, seg: string) =>
    call<PairDetail["fit"]>(`/fit/${encodeURIComponent(s)}/${ref}/${tgt}?segment=${encodeURIComponent(seg)}`),
  extends: (s: string) => call<{ units: ExtendUnit[] }>(`/extends/${encodeURIComponent(s)}`),
  extendPair: (s: string, ref: number, tgt: number, u: ExtendUnit) =>
    call<{ computed: boolean; lags?: number[]; ccg?: number[]; baseline?: number[]; acg_ref?: number[]; acg_tgt?: number[] }>(
      `/extend/${encodeURIComponent(s)}/${ref}/${tgt}?name=${encodeURIComponent(u.name)}&window_ms=${u.window_ms}&bin_ms=${u.bin_ms}&segment=${encodeURIComponent(u.segment)}`),
  themes: (s: string) => call<Record<string, [number, number, string][]>>(`/themes/${encodeURIComponent(s)}`),
  segments: (s: string) => call<{ segments: Segment[]; bounds: [number, number] }>(`/segments/${encodeURIComponent(s)}`),
  segmentLinks: (s: string, seg: string, norms: string[]) => call<SegLinks>(`/segment_links/${encodeURIComponent(s)}/${encodeURIComponent(seg)}?norms=${norms.join(",")}`),
  neuronValues: (s: string) => call<NeuronValues>(`/neuron_values/${encodeURIComponent(s)}`),
  placefield: (s: string, nid: number) => call<{ curves: { block: string; direction: string; rate: (number | null)[] }[] }>(`/placefield/${encodeURIComponent(s)}/${nid}`),
  waveform: (s: string, idx: number) => call<{ t_ms: number[] | null; amp: number[] | null }>(`/waveform/${encodeURIComponent(s)}/${idx}`),
  jitterStart: (s: string, ref: number, tgt: number, res: string) => call<JitterStatus>(`/jitter/${encodeURIComponent(s)}/${ref}/${tgt}?res=${res}`, { method: "POST" }),
  jitterStatus: (s: string, ref: number, tgt: number, res: string) => call<JitterStatus>(`/jitter/${encodeURIComponent(s)}/${ref}/${tgt}?res=${res}`),
  pairState: (s: string, pairs: number[][], state: string) =>
    call<{ neurons: Neuron[]; links: Link[] }>("/pair_state", { method: "POST", body: JSON.stringify({ session: s, pairs, state }) }),
  peakCalls: (s: string, ref: number, tgt: number, calls: [number, boolean][]) =>
    call<PairDetail["fit"]>("/peak_calls", { method: "POST", body: JSON.stringify({ session: s, ref, tgt, calls }) }),
  startFits: (s: string) => call<FitProgress>(`/fits/${encodeURIComponent(s)}`, { method: "POST" }),
  fits: (s: string, since: number) => call<FitProgress>(`/fits/${encodeURIComponent(s)}?since=${since}`),
  saveImages: (images: Record<string, string>) => call<{ folder: string }>("/images", { method: "POST", body: JSON.stringify({ images }) }),
  tags: (edit: { kind: "pair" | "neuron"; group: string; op: "add" | "remove"; members: Record<string, (number | number[])[]> }) =>
    call<Record<string, { neurons: Neuron[]; links: Link[] }>>("/tags", { method: "POST", body: JSON.stringify(edit) }),
};

export const toPoints = (xy: [number, number][]): Point[] => xy.map(([x, y]) => ({ x, y }));
