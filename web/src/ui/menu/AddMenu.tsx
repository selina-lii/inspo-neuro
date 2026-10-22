// "Add an object": the things that can be put in the space. A stats test opens an existing one (several at once) or a
// new one in the editor; the panels expand where they are; a network copy shows one segment beside the others in 3D.
import { useState } from "react";
import { addCcgPanel, addNetwork, openPanel, setMainHidden, setView } from "../../actions";
import { newTest, openSaved, sceneFrame } from "../../statsActions";
import { store } from "../../core/store";
import { addGrid, addNode, addStyle } from "../../gridActions";
import { useStore } from "../useStore";

export const MAIN_SEGMENT = /^(pre|maze\d*|post|remaze\d*|sd\d*|rs\d*|nsd\d*)$/i;
const PANELS: [string, string][] = [["ccg", "CCG plot & config"], ["timeline", "time slider"], ["pairs", "pair list"], ["details", "selection & details"], ["legend", "legend"], ["metadata", "metadata"]];

export function AddMenu({ onDone }: { onDone(): void }) {
  const [stats, setStats] = useState<"closed" | "open" | "existing">("closed");
  const [net, setNet] = useState(false);
  const { segments: segs, tieOnAdd, mainHidden, panels } = useStore();
  const segments = segs.map((x) => x.name).filter((x) => MAIN_SEGMENT.test(x));
  const done = (f: () => void) => () => (f(), onDone());
  if (stats === "existing") return <ExistingTests onDone={onDone} />;
  return (
    <div className="add-menu">
      <button onClick={() => setStats(stats === "open" ? "closed" : "open")}>stats test {stats === "open" ? "▾" : "▸"}</button>
      {stats === "open" && (
        <div className="add-sub">
          <button onClick={() => setStats("existing")}>existing…</button>
          <button onClick={done(() => (newTest(), openPanel("stats")))}>new</button>
          <label title="stack every session the test spans along z behind the main network, its board on the side wall">
            <input type="checkbox" checked={tieOnAdd} onChange={(e) => store.set({ tieOnAdd: e.target.checked })} /> bring in its networks
          </label>
        </div>
      )}
      {/* the first CCG panel opens; once it is out, each add is another with a copy of its options */}
      {PANELS.map(([id, label]) => <button key={id} onClick={done(() => (id === "ccg" && !panels.find((p) => p.id === "ccg")!.closed ? addCcgPanel() : openPanel(id)))}>{label}</button>)}
      <button title="small CCGs of many pairs as one object: cable it to a network or a stats board" onClick={done(() => (addGrid(), setView("3d")))}>CCG grid</button>
      <button title="picks pairs by session, rule, state and value range: cable its port into grids" onClick={done(() => (addNode(), setView("3d")))}>pair filter node</button>
      <button title="colour, thickness, transparency and layer order of each segment's curves: cable its port into grids" onClick={done(() => (addStyle(), setView("3d")))}>curve style node</button>
      <button onClick={() => setNet(!net)}>neuron network {net ? "▾" : "▸"}</button>
      {net && (
        <div className="add-sub">
          {mainHidden && <button onClick={done(() => setMainHidden(false))}>the open session's own network</button>}
          {["all", ...segments].map((seg) => (
            <button key={seg} onClick={done(() => {
              const { center, extent } = sceneFrame();
              addNetwork(seg, center, extent);
              setView("3d");
            })}>{seg === "all" ? "whole session" : seg}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pick one or more saved tests to open; each lands beside the boards already out. */
function ExistingTests({ onDone }: { onDone(): void }) {
  const { stats: s, tieOnAdd } = useStore();
  const open = new Set(s.tests.map((t) => t.name));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const flip = (name: string) => setPicked((p) => {
    const next = new Set(p);
    if (!next.delete(name)) next.add(name);
    return next;
  });
  return (
    <div className="add-dialog" onKeyDown={(e) => e.key === "Enter" && picked.size && (e.preventDefault(), [...picked].forEach((x) => openSaved(x, tieOnAdd)), onDone())}>
      <div className="menu-sec-title">open saved stats tests</div>
      <div className="add-list">
        {s.saved.map((x) => (
          <label key={x.name}>
            <input type="checkbox" checked={picked.has(x.name)} onChange={() => flip(x.name)} />
            {x.name}{open.has(x.name) ? " (open: adds a copy)" : ""}
          </label>
        ))}
      </div>
      <div className="row">
        <button className="primary" disabled={!picked.size} onClick={() => ([...picked].forEach((x) => openSaved(x, tieOnAdd)), onDone())}>open {picked.size || ""}</button>
        <button onClick={onDone}>cancel</button>
      </div>
    </div>
  );
}
