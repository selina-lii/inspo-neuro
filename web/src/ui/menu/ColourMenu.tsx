// How neurons and links are coloured, and what a link's dash, width and opacity mean.
import { setLinkColor } from "../../actions";
import { store, type LinkEncoding } from "../../core/store";
import { useStore } from "../useStore";
import { MenuSection } from "./Menu";

const MAIN = /^(all|pre|maze\d*|post|remaze\d*|sd\d*|rs\d*|nsd\d*)$/i;

export function ColourMenu() {
  const s = useStore();
  const segNames = s.segments.map((x) => x.name);
  const rateSegs = s.neuronValues ? Object.keys(s.neuronValues.rates).filter((x) => MAIN.test(x)) : [];
  const [kind, arg = ""] = s.neuronColor.split(/:(.*)/s) as [string, string?];
  const [ra = "maze", rb = "pre"] = kind === "ratio" ? arg.split("/") : ["maze", "pre"];
  const setEncoding = (patch: Partial<LinkEncoding>) => store.set({ encoding: { ...s.encoding, ...patch } });
  const segSelect = (value: string, onChange: (v: string) => void, title: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} title={title}>
      {["all", ...segNames].map((x) => <option key={x}>{x}</option>)}
    </select>
  );
  return (
    <>
      <MenuSection title="neurons by">
          <select value={kind} onChange={(e) => {
            const k = e.target.value;
            store.set({ neuronColor: k === "type" || k === "area" || k === "random" ? k : k === "rate" ? `rate:${rateSegs.includes("maze") ? "maze" : rateSegs[0] ?? "all"}` : k === "ratio" ? `ratio:${ra}/${rb}` : k === "place" ? `place:${Object.keys(s.neuronValues?.place ?? {})[0] ?? "maze"}` : `${k}:${s.neuronValues?.specs[0]?.name ?? ""}` });
          }}>
            <option value="type">type (pyr red, int blue)</option>
            <option value="random">one colour each (pyr warm, int cold)</option>
            <option value="area">region</option>
            <option value="rate">firing rate in…</option>
            <option value="ratio">rate ratio between…</option>
            <option value="spec">tag label</option>
            <option value="specv">tag value</option>
            <option value="place">place cell in…</option>
          </select>
          {kind === "rate" && (
            <select value={arg} onChange={(e) => store.set({ neuronColor: `rate:${e.target.value}` })}>
              {rateSegs.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          )}
          {kind === "ratio" && (
            <>
              <select value={ra} onChange={(e) => store.set({ neuronColor: `ratio:${e.target.value}/${rb}` })}>
                {rateSegs.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <span className="label">÷</span>
              <select value={rb} onChange={(e) => store.set({ neuronColor: `ratio:${ra}/${e.target.value}` })}>
                {rateSegs.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </>
          )}
          {(kind === "spec" || kind === "specv") && (
            <select value={arg} onChange={(e) => store.set({ neuronColor: `${kind}:${e.target.value}` })}>
              {(s.neuronValues?.specs ?? []).map((x) => (
                <option key={x.name}>{x.name}</option>
              ))}
            </select>
          )}
          {kind === "place" && (
            <select value={arg} onChange={(e) => store.set({ neuronColor: `place:${e.target.value}` })}>
              {Object.keys(s.neuronValues?.place ?? {}).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          )}
      </MenuSection>
      <MenuSection title="links by">
          <select value={s.linkColor.kind} onChange={(e) => setLinkColor({ kind: e.target.value as typeof s.linkColor.kind })}>
            <option value="type">connection type</option>
            <option value="strength">strength in the map's segment</option>
            <option value="change">strength change between…</option>
            <option value="onoff">on/off between…</option>
            <option value="group">pair group (picked in the group filter)</option>
            <option value="ends">gradient between its two neurons' colours</option>
          </select>
          {(s.linkColor.kind === "change" || s.linkColor.kind === "onoff") && (
            <>
              {segSelect(s.linkColor.a, (a) => setLinkColor({ a }), "from segment")}
              <span className="label">→</span>
              {segSelect(s.linkColor.b, (b) => setLinkColor({ b }), "to segment")}
            </>
          )}
      </MenuSection>
      <MenuSection title="link encoding">
        <label className="pair">dash means
          <select value={s.encoding.dash} onChange={(e) => setEncoding({ dash: e.target.value as LinkEncoding["dash"] })}>
            <option value="uncertain">uncertain peak fit</option>
            <option value="off">off in the map's segment</option>
            <option value="unselected">not selected</option>
            <option value="none">nothing (all solid)</option>
          </select>
        </label>
        <label className="pair" title="excess: counts over baseline in 1–6 ms, in Poisson SDs · CS: the Qt GUI's connection strength (STG, lo-res test window, no normalization)">strength =
          <select value={s.encoding.measure} onChange={(e) => setEncoding({ measure: e.target.value as LinkEncoding["measure"] })}>
            <option value="excess">excess over baseline (SDs)</option>
            <option value="cs">CS as in the Qt GUI (STG)</option>
          </select>
        </label>
        <label className="pair">width means
          <select value={s.encoding.width} onChange={(e) => setEncoding({ width: e.target.value as LinkEncoding["width"] })}>
            <option value="strength">strength</option>
            <option value="constant">nothing (all equal)</option>
          </select>
        </label>
        <label className="pair">link opacity
          <input type="range" min={0.05} max={1} step={0.05} value={s.linkAlpha} onChange={(e) => store.set({ linkAlpha: Number(e.target.value) })} />
          <span className="num">{Math.round(s.linkAlpha * 100)}%</span>
        </label>
      </MenuSection>
    </>
  );
}
