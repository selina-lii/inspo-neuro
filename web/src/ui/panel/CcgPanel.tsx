// The focused pair's CCG on its own: the plot, its peak fit and its jitter; a space panel in 2D, a card by its link in 3D.
import { useContext, useEffect, useState } from "react";
import { countUnsaved } from "../../actions";
import { TYPE_COLORS } from "../../core/colors";
import { normalize, segmentHours, type NormInputs } from "../../core/norms";
import { activeSegment, store, type CcgOptions } from "../../core/store";
import type { FitPeak, PairDetail } from "../../core/types";
import { api, type JitterStatus } from "../../io/api";
import { acgOf, fitOf, forgetFits, setFit, tracesKey, traceOf, waveformOf } from "../../io/traces";
import { useStore } from "../useStore";
import { CcgPlot, type Waveform } from "./CcgPlot";
import { PanelId, usePanelCcg } from "./panelCcg";
import type { CcgGrid } from "../../core/grid";
import { useGridItems } from "../galaxy/grid/gridItems";

const plotOf = (detail: PairDetail, options: CcgOptions, color: string, norm: NormInputs) => {
  const { trace, fitScale } = normalize(detail[options.res], options.norms, norm);
  return { curves: [{ trace, color }], fitScale, rawFit: detail.fit };
};

export function CcgBody() {
  const s = useStore();
  const id = useContext(PanelId);
  const pair = s.panels.find((p) => p.id === id)?.pair;
  const grid = s.grids.find((g) => g.config === id);
  // a card clicked in its grid opens as the grid draws it: its segments or rows, any session
  if (pair && grid) return <GridPairCcg grid={grid} pair={pair} />;
  if (s.focus?.kind !== "pair") return <div className="empty">{grid ? "Click a card in its grid, or a link, to see its CCG here." : "Click a link to see its CCG here."}</div>;
  return <PairCcg ref_={s.focus.ref} tgt={s.focus.tgt} />;
}

/** A grid's card, enlarged: the grid already holds its curves. */
function GridPairCcg({ grid, pair }: { grid: CcgGrid; pair: string }) {
  const [ccg] = usePanelCcg();
  const item = useGridItems(grid).find((i) => i.key === pair);
  if (!item?.curves.length) return <div className="empty">Loading {pair.split("|")[0]}…</div>;
  const named = item.curves.length > 1;
  return <CcgPlot curves={item.curves.map((c) => ({ trace: c.trace, color: c.color, name: named ? c.label : undefined }))} fitScale={null} options={ccg} title={item.title} />;
}

function PairCcg({ ref_, tgt }: { ref_: number; tgt: number }) {
  const s = useStore();
  const [ccg] = usePanelCcg();
  const segment = activeSegment(s);
  const [fit, setFitState] = useState<{ key: string; fit: PairDetail["fit"] } | null>(null);
  const [wave, setWave] = useState<{ ref: number; wave: Waveform } | null>(null);
  const [jitter, setJitter] = useState<{ key: string; status: JitterStatus } | null>(null);
  const [ext, setExt] = useState<{ key: string; data: Awaited<ReturnType<typeof api.extendPair>> } | null>(null);
  const link = s.links.find((l) => l.ref === ref_ && l.tgt === tgt);
  const a = s.neurons[ref_];
  const b = s.neurons[tgt];
  const key = `${s.session}:${segment}:${ref_}-${tgt}`;

  useEffect(() => {
    if (!s.session || !link) return;
    let live = true;
    fitOf(s.session, segment, ref_, tgt).then((f) => live && setFitState({ key, fit: f }), () => live && setFitState({ key, fit: { fitted: false, confident: false } }));
    return () => {
      live = false;
    };
  }, [key, Boolean(link)]);

  useEffect(() => {
    if (!s.session || !ccg.wf) return;
    let live = true;
    waveformOf(s.session, ref_).then((w) => live && setWave({ ref: ref_, wave: w }));
    return () => {
      live = false;
    };
  }, [s.session, ref_, ccg.wf]);

  // jitter runs on the server in its own process; poll until it lands
  const jitterKey = `${s.session}:${ref_}-${tgt}:${ccg.res}`;
  useEffect(() => {
    if (!s.session || !ccg.jitter) return;
    let live = true;
    let timer = 0;
    const session = s.session;
    const poll = (st: JitterStatus) => {
      if (!live) return;
      setJitter({ key: jitterKey, status: st });
      if (st.status === "running") timer = window.setTimeout(() => api.jitterStatus(session, ref_, tgt, ccg.res).then(poll), 1500);
    };
    api.jitterStart(session, ref_, tgt, ccg.res).then(poll, (e: Error) => poll({ status: "error", error: e.message }));
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [jitterKey, ccg.jitter]);

  const extKey = `${s.session}:${ref_}-${tgt}:${ccg.extend}`;
  useEffect(() => {
    const unit = s.extendUnits.find((u) => `${u.name}|${u.window_ms}|${u.bin_ms}|${u.segment}` === ccg.extend);
    if (!s.session || !unit) return;
    let live = true;
    api.extendPair(s.session, ref_, tgt, unit).then((d) => live && setExt({ key: extKey, data: d }));
    return () => {
      live = false;
    };
  }, [extKey]);

  if (!link || !a || !b || !s.session) return null;
  const session = s.session;
  const extData = ccg.extend && ext?.key === extKey ? ext.data : null;
  const jit = jitter?.key === jitterKey ? jitter.status : null;
  const ready = s.traces === tracesKey(session, segment);
  const lowres = ready ? traceOf(session, segment, ref_, tgt, "lowres") : null;
  const highres = ready ? traceOf(session, segment, ref_, tgt, "highres") : null;
  const pairFit = fit?.key === key ? fit.fit : null;
  // an extend window replaces both resolutions; it has no stored fit, p-values or jitter
  const extTrace = extData?.computed ? { lags: extData.lags!, ccg: extData.ccg!, baseline: extData.baseline! } : null;
  const detail: PairDetail | null = ccg.extend
    ? extTrace && { type: link.type, lowres: extTrace, highres: extTrace, fit: { fitted: false, confident: false } }
    : lowres && highres ? { type: link.type, lowres, highres, fit: pairFit ?? { fitted: false, confident: false } } : null;

  // a peak's hand call cycles auto → certain → uncertain → auto; calls on other peaks stay
  const cyclePeak = async (peak: FitPeak) => {
    const peaks = pairFit?.peaks ?? [];
    const near = (c: number) => peaks.find((p) => p.edges[0] <= c && c <= p.edges[1]);
    const calls: [number, boolean][] = peaks.filter((p) => p.called && near(p.center) !== peak).map((p) => [p.center, p.confident]);
    if (!peak.called) calls.push([peak.center, true]);
    else if (peak.confident) calls.push([peak.center, false]);
    try {
      const updated = await api.peakCalls(session, ref_, tgt, calls);
      countUnsaved();
      forgetFits(session, ref_, tgt);
      setFit(session, "all", ref_, tgt, updated);
      if (segment === "all") setFitState({ key, fit: updated });
      else fitOf(session, segment, ref_, tgt).then((f) => setFitState({ key, fit: f }));
    } catch (error) {
      store.set({ error: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <section className="ccgpanel">
      {detail ? (
        <CcgPlot {...plotOf(detail, ccg, TYPE_COLORS[link.type] ?? "#888", { refRate: a.rate, tgtRate: b.rate, hours: segmentHours(s, segment) })} options={ccg} title={`${session} · ${segment} · #${a.id} → #${b.id} · ${a.type} → ${b.type} · ${ccg.res}`} onPeak={cyclePeak}
          wave={wave?.ref === ref_ ? wave.wave : null} jitter={jit?.status === "done" ? jit.result : null}
          acgs={ccg.extend ? { ref: extData?.acg_ref ?? null, tgt: extData?.acg_tgt ?? null } : { ref: acgOf(session, segment, ref_, ccg.res), tgt: acgOf(session, segment, tgt, ccg.res) }} />
      ) : (
        <div className="loading">{ccg.extend ? (extData && !extData.computed ? "this pair is not in the extend unit" : "loading the extend window…") : `loading ${segment} CCGs…`}</div>
      )}
      <div className="fit">{!pairFit ? "fitting peaks…" : pairFit.fitted ? pairFit.label : "no peak fits here"}</div>
      {s.segLinks[segment] && <div className="fit">CS {s.segLinks[segment].cs[link.i]?.toFixed(2) ?? "–"} in {segment}{ccg.norms.length ? " (normalised)" : ""}</div>}
      {ccg.jitter && (
        <div className="fit">
          {!jit || jit.status === "running" ? `jitter running on the whole session (${ccg.res === "lowres" ? "lo" : "hi"}-res, about a minute)…`
            : jit.status === "error" ? `jitter failed: ${jit.error}` : `jitter p = ${jit.result?.j_pval ?? "–"} (whole session)`}
        </div>
      )}
    </section>
  );
}
