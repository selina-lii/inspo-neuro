// A grid's stats view: each pair's value per curve, fetched from the server under its linked test's CS settings.
import { useEffect, useState } from "react";
import { fail } from "../../../actions";
import { linkedTest, optionsOf, type CcgGrid } from "../../../core/grid";
import { gridCurves } from "../../../feedActions";
import { statsApi } from "../../../io/stats";
import { useStore } from "../../useStore";

export type Series = Record<string, Record<string, number | null>>;

export function useSeries(grid: CcgGrid, keys: string[]): Series | null {
  const s = useStore();
  const [series, setSeries] = useState<{ want: string; values: Series } | null>(null);
  const display = linkedTest(s, grid)?.config.display ?? null;
  const req = { curves: gridCurves(grid), pairs: [...keys].sort(), metric: grid.metric ?? "Conn Strength", resolution: optionsOf(s, grid).res, display };
  const want = JSON.stringify(req);
  useEffect(() => {
    if (grid.view !== "stats" || !keys.length) return;
    let live = true;
    statsApi.series(req).then((values) => live && setSeries({ want, values }), fail);
    return () => void (live = false);
  }, [grid.view, want]);
  return series?.want === want ? series.values : null;
}
