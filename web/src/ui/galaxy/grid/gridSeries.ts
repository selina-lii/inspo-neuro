// A grid's stats view: each pair's value per curve, the linked test's own result where it has one, else fetched under its CS settings.
import { useEffect, useMemo, useState } from "react";
import { fail } from "../../../actions";
import { linkedTest, optionsOf, type CcgGrid } from "../../../core/grid";
import type { StatsResult, StatsTest, StatsValue } from "../../../core/stats";
import { gridCurves } from "../../../feedActions";
import { statsApi } from "../../../io/stats";
import { stackOf } from "../../../stackActions";
import { useStore } from "../../useStore";

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

/** The linked test's result the grid reads, if it has one: the one its board shows. */
export function seriesResult(s: ReturnType<typeof useStore>, grid: CcgGrid): { test: StatsTest; result: StatsResult } | null {
  const test = linkedTest(s, grid);
  const result = test && (stackOf(test.id)?.result ?? test.results[0]);
  return test && result ? { test, result } : null;
}

export function useSeries(grid: CcgGrid, keys: string[]): Series | null {
  const s = useStore();
  const linked = seriesResult(s, grid);
  const own = useMemo(() => (linked ? fromResult(grid, linked.test, linked.result, s.stats.values) : null), [linked?.result, linked?.test.config.rows, s.stats.values, grid]);
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
  return own ?? (series?.want === want ? series.values : null);
}
