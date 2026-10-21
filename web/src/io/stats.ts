// The stats routes: run, save and load tests through NeuroPy's StatsTestBackend.
import type { StatsConfig, StatsOptions, StatsPayload } from "../core/stats";
import { call } from "./api";

export type RunStatus = { status: "running" } | { status: "error"; error: string } | ({ status: "done"; config: StatsConfig } & StatsPayload);

export const statsApi = {
  options: () => call<StatsOptions>("/stats/options"),
  saved: () => call<{ saved: { name: string; saved_at: string }[] }>("/stats/saved"),
  load: (name: string) => call<{ name: string; config: StatsConfig } & StatsPayload>(`/stats/saved/${encodeURIComponent(name)}`),
  run: (config: StatsConfig) => call<{ job: number }>("/stats/run", { method: "POST", body: JSON.stringify(config) }),
  status: (job: number) => call<RunStatus>(`/stats/run/${job}`),
  save: (name: string, job: number) => call<{ ok: boolean; name: string }>("/stats/save", { method: "POST", body: JSON.stringify({ name, job }) }),
};
