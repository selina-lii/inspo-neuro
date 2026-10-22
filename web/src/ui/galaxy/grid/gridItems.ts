// A grid's pairs from its source: a network's shown or selected links or a pair node's pick in the grid's segments, or a stats test's pairs by row.
import { useEffect, useMemo, useState } from "react";
import { ensureSegLinks } from "../../../actions";
import { paletteColor, TYPE_COLORS } from "../../../core/colors";
import { visibleLinks } from "../../../core/derive";
import { nodePairs, optionsOf, sortItems, trayKeys, type CcgGrid, type GridItem } from "../../../core/grid";
import { normalize } from "../../../core/norms";
import { rowsWithPair, rowTrace, type StackLayer } from "../../../core/stack";
import type { CcgOptions, State } from "../../../core/store";
import type { Link } from "../../../core/types";
import { linkKey } from "../../../core/types";
import { loadTraces, traceOf } from "../../../io/traces";
import { ensureLayer, ensureStack, stackOf, tiedPairs } from "../../../stackActions";
import { useStore } from "../../useStore";

export function useGridItems(grid: CcgGrid): GridItem[] {
  const s = useStore();
  const [kind, id] = (grid.source ?? ":").split(":") as [string, string];
  const node = kind === "node" ? s.pairNodes.find((n) => n.id === id) : undefined;
  const picked = node ? nodePairs(s, node) : [];
  const bySession = new Map<string, string[]>();
  for (const key of picked) {
    const [session, r, t] = key.split("|") as [string, string, string];
    bySession.set(session, [...(bySession.get(session) ?? []), `${r}-${t}`]);
  }
  const o = optionsOf(s, grid);
  const tray = trayKeys(s, grid);
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    if (kind === "board") return ensureStack(id);
    // the open session's pairs come from its network; the others' from their layers
    for (const [session, pairs] of bySession) if (session !== s.session) ensureLayer(session, grid.segments, pairs, o.res);
    if ((kind !== "net" && !bySession.has(s.session ?? "")) || !s.session) return;
    for (const seg of grid.segments) {
      ensureSegLinks(s.session, seg);
      loadTraces(s.session, seg).then(() => setLoaded((n) => n + 1));
    }
  }, [kind, id, s.session, grid.segments.join(), o.norms.join(), o.res, picked.join()]);
  return useMemo(() => {
    const all = kind === "board" ? boardItems(s, id, o) : kind === "net" ? networkItems(s, grid, netLinks(s, grid, id), o) : kind === "node" ? nodeItems(s, grid, bySession, o) : [];
    const items = all.filter((x) => tray.keys.has(x.key) === tray.own);
    const sessions = kind === "board" ? stackOf(id)?.sessions ?? [] : [s.session ?? "", ...bySession.keys()];
    return sortItems(items, grid.sort, sessions);
  }, [s.links, s.filters, s.selection, s.segLinks, s.stack, s.stats.values, o, s.ties, grid.sort, grid.pairs, s.stats.pick, grid.segments.join(), grid.source, loaded, tray.own, [...tray.keys].join(), picked.join()]);
}

function netLinks(s: State, grid: CcgGrid, network: string): Link[] {
  const inTest = tiedPairs(network, s.session!);
  const base = inTest ? s.links.filter((l) => inTest.has(linkKey(l.ref, l.tgt))) : visibleLinks(s.links, s.filters, s.neurons);
  return grid.pairs === "selected" ? base.filter((l) => s.selection.links.has(linkKey(l.ref, l.tgt))) : base;
}

function nodeItems(s: State, grid: CcgGrid, bySession: Map<string, string[]>, o: CcgOptions): GridItem[] {
  return [...bySession].flatMap(([session, pairs]) => {
    const want = new Set(pairs);
    if (session === s.session) return networkItems(s, grid, s.links.filter((l) => want.has(linkKey(l.ref, l.tgt))), o);
    const layer = s.stack[session];
    return layer ? layerItems(layer, grid, layer.links.filter((l) => want.has(linkKey(l.ref, l.tgt))), o) : [];
  });
}

/** Another session's pairs off its layer: a curve per grid segment. */
function layerItems(layer: StackLayer, grid: CcgGrid, links: Link[], o: CcgOptions): GridItem[] {
  return links.map((l) => {
    const [a, b] = [layer.neurons[l.ref], layer.neurons[l.tgt]];
    const curves = grid.segments.flatMap((seg) => {
      const trace = rowTrace(layer, { name: seg, color: paletteColor(seg), segments: [seg] }, l.ref, l.tgt, o.norms);
      return trace ? [{ label: seg, color: paletteColor(seg), trace }] : [];
    });
    return {
      key: `${layer.session}|${l.ref}|${l.tgt}`, session: layer.session, ref: l.ref, tgt: l.tgt, title: `${layer.session} #${a?.id} → #${b?.id}`,
      color: TYPE_COLORS[l.type] ?? "#888", strength: l.strength, on: grid.segments.filter((seg) => layer.segLinks[seg]?.on[l.i]).length, groups: l.groups, curves,
    };
  });
}

function networkItems(s: State, grid: CcgGrid, links: Link[], o: CcgOptions): GridItem[] {
  const session = s.session!;
  const hours = (seg: string) => (seg === "all" ? s.segments.reduce((a, x) => a + x.duration, 0) : s.segments.find((x) => x.name === seg)?.duration ?? 0) / 3600;
  return links.map((l) => {
    const [a, b] = [s.neurons[l.ref], s.neurons[l.tgt]];
    const curves = grid.segments.flatMap((seg) => {
      const raw = traceOf(session, seg, l.ref, l.tgt, o.res);
      return raw ? [{ label: seg, color: paletteColor(seg), trace: normalize(raw, o.norms, { refRate: a?.rate ?? 1, tgtRate: b?.rate ?? 1, hours: hours(seg) }).trace }] : [];
    });
    return {
      key: `${session}|${l.ref}|${l.tgt}`, session, ref: l.ref, tgt: l.tgt, title: `#${a?.id} → #${b?.id}`, color: TYPE_COLORS[l.type] ?? "#888",
      strength: l.strength, on: grid.segments.filter((seg) => s.segLinks[seg]?.on[l.i]).length, groups: l.groups, curves,
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
    return [{ key: pair, session, ref, tgt, title: `${session} #${a?.id} → #${b?.id}`, color: TYPE_COLORS[link?.type ?? ""] ?? "#888", strength: link?.strength ?? 0, on, groups: link?.groups ?? [], curves }];
  });
}
