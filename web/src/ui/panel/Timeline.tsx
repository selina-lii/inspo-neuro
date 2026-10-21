// The session's segments on its timeline. Clicking one shows it on the active map; a family (post_ninth01…09) can be
// stepped or played, and links can be coloured by the change from the previous step.
import { useEffect, useMemo, useRef, useState } from "react";
import { addMap, setLinkColor, setMapSegment } from "../../actions";
import { activeSegment, store } from "../../core/store";
import type { Segment } from "../../core/types";
import { useStore } from "../useStore";

const family = (name: string) => name.replace(/\d+$/, "");

/** Each numbered family with more than one member, in timeline order. */
export function families(segments: Segment[]): { label: string; items: Segment[] }[] {
  const by = new Map<string, Segment[]>();
  for (const s of segments) by.set(family(s.name), [...(by.get(family(s.name)) ?? []), s]);
  return [...by].filter(([, items]) => items.length > 1).map(([label, items]) => ({ label, items }));
}

/** Segments packed into lanes so none overlap. */
export function lanes(segments: Segment[]): Segment[][] {
  const out: Segment[][] = [];
  for (const s of [...segments].sort((a, b) => a.start - b.start)) {
    const lane = out.find((l) => l[l.length - 1]!.stop <= s.start);
    if (lane) lane.push(s);
    else out.push([s]);
  }
  return out;
}

/** Rows of the timeline: each numbered family on its own row, the rest packed into lanes. */
function rows(segments: Segment[]): { label: string; items: Segment[] }[] {
  const fams = families(segments);
  const inFamily = new Set(fams.flatMap((f) => f.items.map((s) => s.name)));
  const singles = segments.filter((s) => !inFamily.has(s.name));
  return [...lanes(singles).map((items, i) => ({ label: i ? "" : "epochs", items })), ...fams];
}

/** Which segment the active map shows, the whole-session and new-map buttons, and stepping through a family. */
export function TimelineHead() {
  const s = useStore();
  const current = activeSegment(s);
  const fams = useMemo(() => families(s.segments), [s.segments]);
  const [fam, setFam] = useState("");
  const [playing, setPlaying] = useState(false);
  const steps = (fams.find((f) => f.label === fam) ?? fams[0])?.items ?? [];
  const stepIndex = steps.findIndex((x) => x.name === current);

  const mapWidth = useMemo(() => {
    const xs = s.positions.map((p) => p.x);
    return xs.length ? Math.max(...xs) - Math.min(...xs) : 1000;
  }, [s.positions]);

  const go = (i: number) => {
    const seg = steps[(i + steps.length) % steps.length];
    if (seg) setMapSegment(s.activeMap, seg.name);
  };

  useEffect(() => {
    if (!playing || !steps.length) return;
    const timer = window.setInterval(() => go(stepIndex + 1), 1400);
    return () => window.clearInterval(timer);
  }, [playing, stepIndex, steps.length]);

  const prev = stepIndex > 0 ? steps[stepIndex - 1] : undefined;
  return (
    <>
      <div className="row">
        <span className="muted">active map shows</span>
        <strong>{current}</strong>
        <button onClick={() => setMapSegment(s.activeMap, "all")} disabled={current === "all"}>whole session</button>
        <button onClick={() => addMap(current, mapWidth)} title="a second map beside this one, for comparing segments">+ map for {current}</button>
      </div>
      {fams.length > 0 && (
        <div className="row">
          <span className="muted">step</span>
          <select value={fam || fams[0]!.label} onChange={(e) => setFam(e.target.value)}>
            {fams.map((f) => (
              <option key={f.label} value={f.label}>{f.label} ({f.items.length})</option>
            ))}
          </select>
          <button onClick={() => go(stepIndex - 1)}>◀</button>
          <input type="range" min={0} max={Math.max(steps.length - 1, 0)} value={Math.max(stepIndex, 0)} onChange={(e) => go(Number(e.target.value))} />
          <button onClick={() => go(stepIndex + 1)}>▶</button>
          <button className={playing ? "on" : ""} onClick={() => setPlaying(!playing)}>{playing ? "pause" : "play"}</button>
          {prev && (
            <button onClick={() => setLinkColor({ kind: "change", a: prev.name, b: current })} title="colour links by the strength change from the previous step">
              colour by change {prev.name} → {current}
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** One lane of segments as buttons on the time axis; clicking one shows it on the active map. */
export function SegTrack({ items }: { items: Segment[] }) {
  const s = useStore();
  const current = activeSegment(s);
  const [t0, t1] = s.bounds;
  const x = (t: number) => `${((t - t0) / Math.max(t1 - t0, 1)) * 100}%`;
  const w = (a: number, b: number) => `${Math.max(((b - a) / Math.max(t1 - t0, 1)) * 100, 0.4)}%`;
  return (
    <div className="tl-track">
      {items.map((seg) => (
        <button key={seg.name} className={`tl-seg${seg.name === current ? " on" : ""}`} style={{ left: x(seg.start), width: w(seg.start, seg.stop) }}
          title={`${seg.name}: ${(seg.start / 3600).toFixed(2)}–${(seg.stop / 3600).toFixed(2)} h (${(seg.duration / 3600).toFixed(2)} h)`}
          onClick={() => setMapSegment(s.activeMap, seg.name)}>
          {seg.name}
        </button>
      ))}
    </div>
  );
}

export function TimeAxis() {
  const [t0, t1] = useStore().bounds;
  return (
    <div className="tl-row">
      <span className="tl-label" />
      <div className="tl-axis">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f} style={{ left: `${f * 100}%` }}>{((t0 + f * (t1 - t0)) / 3600).toFixed(1)} h</span>
        ))}
      </div>
    </div>
  );
}

export function Timeline() {
  const s = useStore();
  const layout = useMemo(() => rows(s.segments), [s.segments]);
  return (
    <div className="timeline">
      <TimelineHead />
      {Object.keys(s.themes).length > 0 && (
        <div className="row wrap">
          <span className="muted">epochs</span>
          {Object.keys(s.themes).map((t) => (
            <button key={t} className={`chip plain${s.shownThemes.includes(t) ? " on" : ""}`}
              onClick={() => store.set({ shownThemes: s.shownThemes.includes(t) ? s.shownThemes.filter((x) => x !== t) : [...s.shownThemes, t] })}>
              {t} ({s.themes[t]!.length})
            </button>
          ))}
        </div>
      )}
      <div className="tl-rows">
        {s.shownThemes.filter((t) => s.themes[t]).map((t) => (
          <div className="tl-row" key={`theme-${t}`}>
            <span className="tl-label">{t}</span>
            <ThemeBand epochs={s.themes[t]!} bounds={s.bounds} />
          </div>
        ))}
        {layout.map((r, ri) => (
          <div className="tl-row" key={ri}>
            <span className="tl-label">{r.label}</span>
            <SegTrack items={r.items} />
          </div>
        ))}
        <TimeAxis />
      </div>
    </div>
  );
}

const LABEL_COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"];

/** One theme's epochs on the timeline: a canvas, since a theme can hold tens of thousands (ripples). */
export function ThemeBand({ epochs, bounds }: { epochs: [number, number, string][]; bounds: [number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const labels = useMemo(() => [...new Set(epochs.map((e) => e[2]))].sort(), [epochs]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    [canvas.width, canvas.height] = [w * dpr, h * dpr];
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const [t0, t1] = bounds;
    const x = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * w;
    for (const [a, b, label] of epochs) {
      ctx.fillStyle = LABEL_COLORS[labels.indexOf(label) % LABEL_COLORS.length]!;
      ctx.fillRect(x(a), 1, Math.max(x(b) - x(a), 0.6), h - 2);
    }
  }, [epochs, bounds, labels]);
  return (
    <div className="tl-theme">
      <canvas ref={ref} />
      <div className="tl-theme-labels">
        {labels.slice(0, 10).map((l, i) => (
          <span key={l}><i style={{ background: LABEL_COLORS[i % LABEL_COLORS.length] }} />{l}</span>
        ))}
      </div>
    </div>
  );
}
