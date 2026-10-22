// A grid's stats view: each pair's value per curve, the linked test's own result where it has one, else fetched under its CS settings.
import { useEffect, useState } from "react";
import { fail } from "../../../actions";
import { linkedTest, optionsOf, type CcgGrid } from "../../../core/grid";
import type { StatsResult, StatsTest, StatsValue } from "../../../core/stats";
import { gridCurves } from "../../../feedActions";
import { statsApi } from "../../../io/stats";
import { stackOf } from "../../../stackActions";
import { useStore } from "../../useStore";
import { gridSource } from "../../../core/wires";

export type Series = Record<string, Record<string, number | null>>;

/** The test's plotted values by curve: a row it feeds is keyed by the grid's curve, any other by the row's name. */
function fromResult(grid: CcgGrid, test: StatsTest, result: StatsResult, values: Record<string, StatsValue>): Series {
  const out: Series = {};
  for (const row of result.rows) {
    const cfg = test.config.rows.find((r) => r.name === row.name);
    const label = cfg?.fed === grid.id && cfg.curve ? cfg.curve : row.name;
    const byPair = (out[label] ??= {});
    row.ids.forEach((id, i) => {
      const v = values[id];
      if (v) byPair[v.pair] = row.y[i] ?? null;
    });
  }
  return out;
}

const cache = new WeakMap<StatsResult, { grid: string; rows: unknown; values: unknown; series: Series }>();

/** fromResult, the same object while nothing it reads has changed. */
function cachedFrom(grid: CcgGrid, test: StatsTest, result: StatsResult, values: Record<string, StatsValue>): Series {
  const hit = cache.get(result);
  if (hit && hit.grid === grid.id && hit.rows === test.config.rows && hit.values === values) return hit.series;
  const series = fromResult(grid, test, result, values);
  cache.set(result, { grid: grid.id, rows: test.config.rows, values, series });
  return series;
}

/** The tests a grid's stats view can read, in order: one it feeds that is not stale, then the board feeding it. */
export function readable(s: ReturnType<typeof useStore>, grid: CcgGrid): { test: StatsTest; result: StatsResult }[] {
  const fed = s.stats.tests.find((t) => !t.stale && t.config.rows.some((r) => r.fed === grid.id));
  const [kind, id] = (gridSource(s, grid.id) ?? ":").split(":");
  const source = kind === "board" ? s.stats.tests.find((t) => t.id === id) : undefined;
  return [fed, source].flatMap((test) => {
    const result = test && (stackOf(test.id)?.result ?? test.results[0]);
    return test && result ? [{ test, result }] : [];
  });
}

/** The first readable test's result that measured any of the grid's pairs. */
export function seriesResult(s: ReturnType<typeof useStore>, grid: CcgGrid, keys: string[]): { test: StatsTest; result: StatsResult; series: Series } | null {
  for (const r of readable(s, grid)) {
    const series = cachedFrom(grid, r.test, r.result, s.stats.values);
    if (keys.some((k) => Object.values(series).some((byPair) => byPair[k] != null))) return { ...r, series };
  }
  return null;
}

/** Each pair's value per curve, and the metric they are in. */
export function useSeries(grid: CcgGrid, keys: string[]): { values: Series; metric: string } | null {
  const s = useStore();
  const linked = seriesResult(s, grid, keys);
  const [series, setSeries] = useState<{ want: string; values: Series } | null>(null);
  const display = linkedTest(s, grid)?.config.display ?? null;
  const req = { curves: gridCurves(grid), pairs: [...keys].sort(), metric: grid.metric ?? "Conn Strength", resolution: optionsOf(s, grid).res, display };
  const want = JSON.stringify(req);
  useEffect(() => {
    if (grid.view !== "stats" || !keys.length || linked) return;
    let live = true;
    statsApi.series(req).then((values) => live && setSeries({ want, values }), fail);
    return () => void (live = false);
  }, [grid.view, want, Boolean(linked)]);
  if (linked) return { values: linked.series, metric: linked.result.metric };
  return series?.want === want ? { values: series.values, metric: req.metric } : null;
}
