// Tag the selection: the selected pairs into a pair group, or the selected neurons into a neuron group.
import { useState } from "react";
import { clearSelection, focusPair, select, tagSelection } from "../../actions";
import { linkKey } from "../../core/types";
import { useStore } from "../useStore";

export function TagBar() {
  const s = useStore();
  const [group, setGroup] = useState("");
  const nPairs = s.selection.links.size;
  const nNeurons = s.selection.neurons.size;
  const focusKey = s.focus?.kind === "pair" ? linkKey(s.focus.ref, s.focus.tgt) : null;
  const focusIn = focusKey !== null && s.selection.links.has(focusKey);

  return (
    <section className="tagbar">
      <div className="row">
        <strong>Selection</strong>
        <span className="muted">
          {nPairs} pairs · {nNeurons} neurons
        </span>
        <span className="grow" />
        {focusKey && !focusIn && (
          <button className="linkish" onClick={() => select(new Set(), new Set([focusKey]), true)}>
            + focused pair
          </button>
        )}
        {(nPairs > 0 || nNeurons > 0) && (
          <button className="linkish" onClick={clearSelection}>
            clear
          </button>
        )}
      </div>
      <div className="row">
        <input list="groups" placeholder="group name" value={group} onChange={(e) => setGroup(e.target.value)} />
        <datalist id="groups">
          {[...new Set([...s.pairGroups, ...s.neuronGroups])].map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>
      <div className="row">
        <button disabled={!nPairs || !group.trim()} onClick={() => tagSelection("pair", group, "add")}>tag pairs</button>
        <button disabled={!nPairs || !group.trim()} onClick={() => tagSelection("pair", group, "remove")}>untag pairs</button>
        <button disabled={!nNeurons || !group.trim()} onClick={() => tagSelection("neuron", group, "add")}>tag neurons</button>
        <button disabled={!nNeurons || !group.trim()} onClick={() => tagSelection("neuron", group, "remove")}>untag</button>
      </div>
      {nPairs > 0 && nPairs <= 12 && (
        <div className="chips">
          {[...s.selection.links].map((k) => {
            const [ref, tgt] = k.split("-").map(Number) as [number, number];
            return (
              <button key={k} className="tag" onClick={() => focusPair(ref, tgt)}>
                #{s.neurons[ref]?.id}→#{s.neurons[tgt]?.id}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
