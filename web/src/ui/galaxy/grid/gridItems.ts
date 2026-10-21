// A grid's pairs from its source: a network's shown or selected links in the grid's segments, or a stats test's pairs by row.
import { useEffect, useMemo, useState } from "react";
import { ensureSegLinks } from "../../../actions";
import { paletteColor, TYPE_COLORS } from "../../../core/colors";
import { visibleLinks } from "../../../core/derive";
import { optionsOf, sortItems, sourceOf, type CcgGrid, type GridItem, type PairMode } from "../../../core/grid";
import { normalize } from "../../../core/norms";
import { rowsWithPair, rowTrace } from "../../../core/stack";
import type { CcgOptions, State } from "../../../core/store";
import { linkKey } from "../../../core/types";
import { loadTraces, traceOf } from "../../../io/traces";
import { ensureStack, stackOf, tiedPairs } from "../../../stackActions";
import { useStore } from "../../useStore";

export function useGridItems(grid: CcgGrid): GridItem[] {
  const s = useStore();
  // through a pair node: its own source, and only the pairs it keeps
  const node = grid.source?.startsWith("node:") ? s.pairNodes.find((n) => `node:${n.id}` === grid.source) : undefined;
  const [kind, id] = (sourceOf(s, grid) ?? ":").split(":") as [string, string];
  const o = optionsOf(s, grid);
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    if (kind === "board") return ensureStack(id);
    if (kind !== "net" || !s.session) return;
    for (const seg of grid.segments) {
      ensureSegLinks(s.session, seg);
      loadTraces(s.session, seg).then(() => setLoaded((n) => n + 1));
    }
  }, [kind, id, s.session, grid.segments.join(), o.norms.join()]);
  return useMemo(() => {
    const all = kind === "board" ? boardItems(s, id, o) : kind === "net" ? networkItems(s, grid, id, o) : [];
    const items = node ? all.filter(keeps(s, node.mode)) : all;
    const sessions = kind === "board" ? stackOf(id)?.sessions ?? [] : [s.session ?? ""];
    return sortItems(items, grid.sort, sessions);
  }, [s.links, s.filters, s.selection, s.segLinks, s.stack, s.stats.values, o, s.ties, grid.sort, grid.pairs, node, s.stats.pick, grid.segments.join(), grid.source, loaded]);
}

function keeps(s: State, mode: PairMode): (item: GridItem) => boolean {
  if (mode === "selected") return (item) => item.session === s.session && s.selection.links.has(linkKey(item.ref, item.tgt));
  if (mode === "all") return () => true;
  const picked = new Set([...s.stats.pick.ids].map((v) => s.stats.values[v]?.pair));
  return (item) => picked.has(item.key);
}

function networkItems(s: State, grid: CcgGrid, network: string, o: CcgOptions): GridItem[] {
  const session = s.session!;
  const inTest = tiedPairs(network, session);
  const base = inTest ? s.links.filter((l) => inTest.has(linkKey(l.ref, l.tgt))) : visibleLinks(s.links, s.filters, s.neurons);
  const links = grid.pairs === "selected" ? base.filter((l) => s.selection.links.has(linkKey(l.ref, l.tgt))) : base;
  const hours = (seg: string) => (seg === "all" ? s.segments.reduce((a, x) => a + x.duration, 0) : s.segments.find((x) => x.name === seg)?.duration ?? 0) / 3600;
  return links.map((l) => {
    const [a, b] = [s.neurons[l.ref], s.neurons[l.tgt]];
    const curves = grid.segments.flatMap((seg) => {
      const raw = traceOf(session, seg, l.ref, l.tgt, o.res);
      return raw ? [{ label: seg, color: paletteColor(seg), trace: normalize(raw, o.norms, { refRate: a?.rate ?? 1, tgtRate: b?.rate ?? 1, hours: hours(seg) }).trace }] : [];
    });
    return {
      key: `${session}|${l.ref}|${l.tgt}`, session, ref: l.ref, tgt: l.tgt, title: `#${a?.id} → #${b?.id}`, color: TYPE_COLORS[l.type] ?? "#888",
      strength: l.strength, on: grid.segments.filter((seg) => s.segLinks[seg]?.on[l.i]).length, curves,
    };
  });
}

function boardItems(s: State, board: string, o: CcgOptions): GridItem[] {
  const st = stackOf(board);
  if (!st) return [];
  const pairs = [...new Set(st.result.rows.flatMap((r) => r.ids.map((v) => s.stats.values[v]?.pair).filter((p): p is string => Boolean(p))))];
  return pairs.flatMap((pair) => {
    const [session, r, t] = pair.split("|") as [string, string, string];
    const [ref, tgt] = [Number(r), Number(t)];
    const layer = s.stack[session];
    if (!layer) return [];
    const link = layer.links.find((l) => l.ref === ref && l.tgt === tgt);
    const rows = rowsWithPair(st.result, s.stats.values, pair);
    const curves = rows.flatMap((i) => {
      const trace = rowTrace(layer, st.rows[i]!, ref, tgt, o.norms);
      return trace ? [{ label: st.rows[i]!.name, color: st.rows[i]!.color, trace }] : [];
    });
    const on = link ? rows.filter((i) => st.rows[i]!.segments.some((seg) => layer.segLinks[seg]?.on[link.i])).length : 0;
    const [a, b] = [layer.neurons[ref], layer.neurons[tgt]];
    return [{ key: pair, session, ref, tgt, title: `${session} #${a?.id} → #${b?.id}`, color: TYPE_COLORS[link?.type ?? ""] ?? "#888", strength: link?.strength ?? 0, on, curves }];
  });
}
