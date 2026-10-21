// The 3D view's time slider: strips you add, label and remove, each showing one thing on the shared time axis (an epoch
// theme, a segment family, or the other segments), so several can be compared at once.
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../useStore";
import { families, lanes, SegTrack, ThemeBand, TimeAxis, TimelineHead } from "./Timeline";

type Strip = { id: number; name: string; color: string; source: string };   // source: 'theme:<name>', 'family:<label>', 'segments'

const COLORS = ["#8fb3ff", "#ffb3b3", "#b3ffb3", "#ffd9b3", "#e0b3ff", "#b3f0ff"];
const KEY = "neuromap:strips";

function loadStrips(): Strip[] | null {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function StripTimeline() {
  const s = useStore();
  const fams = useMemo(() => families(s.segments), [s.segments]);
  const sources = useMemo(() => [
    ...Object.keys(s.themes).map((t) => ({ value: `theme:${t}`, label: `${t} (${s.themes[t]!.length})` })),
    ...fams.map((f) => ({ value: `family:${f.label}`, label: `${f.label} (${f.items.length} segments)` })),
    { value: "segments", label: "other segments" },
  ], [s.themes, fams]);
  // first use: the strips the fixed timeline would show
  const [strips, setStrips] = useState<Strip[]>(() => loadStrips() ?? [
    ...s.shownThemes.map((t, i) => ({ id: i + 1, name: t, color: COLORS[i % COLORS.length]!, source: `theme:${t}` })),
    { id: 90, name: "segments", color: COLORS[2]!, source: "segments" },
  ]);
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(strips));
    } catch {
      // storage blocked: strips reset on reload
    }
  }, [strips]);

  const put = (id: number, patch: Partial<Strip>) => setStrips(strips.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const add = () => {
    const i = strips.length;
    const source = sources[0]?.value ?? "segments";
    setStrips([...strips, { id: Math.max(0, ...strips.map((x) => x.id)) + 1, name: source.split(":").pop()!, color: COLORS[i % COLORS.length]!, source }]);
  };
  const inFamily = new Set(fams.flatMap((f) => f.items.map((x) => x.name)));

  const body = (strip: Strip) => {
    const [kind, name] = [strip.source.split(":")[0], strip.source.slice(strip.source.indexOf(":") + 1)];
    if (kind === "theme") return s.themes[name] ? <ThemeBand epochs={s.themes[name]} bounds={s.bounds} /> : <div className="tl-track muted">no {name} here</div>;
    const items = kind === "family" ? fams.find((f) => f.label === name)?.items ?? [] : s.segments.filter((x) => !inFamily.has(x.name));
    return <div className="strip-lanes">{lanes(items).map((lane, i) => <SegTrack key={i} items={lane} />)}</div>;
  };

  return (
    <div className="timeline strips">
      <TimelineHead />
      <div className="tl-rows">
        {strips.map((strip) => (
          <div className="tl-row strip" key={strip.id}>
            <div className="strip-label">
              <input type="color" value={strip.color} onChange={(e) => put(strip.id, { color: e.target.value })} />
              <input value={strip.name} onChange={(e) => put(strip.id, { name: e.target.value })} />
              <select value={strip.source} title="what this strip shows" onChange={(e) => put(strip.id, { source: e.target.value })}>
                {sources.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button className="linkish" title="remove this strip" onClick={() => setStrips(strips.filter((x) => x.id !== strip.id))}>✕</button>
            </div>
            <div className="strip-body" style={{ borderLeft: `4px solid ${strip.color}` }}>{body(strip)}</div>
          </div>
        ))}
        <div className="tl-row">
          <span className="strip-label"><button onClick={add}>+ strip</button></span>
          <span />
        </div>
        <TimeAxis />
      </div>
    </div>
  );
}
