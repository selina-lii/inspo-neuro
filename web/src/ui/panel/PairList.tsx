// The shown pairs as a list, the Qt review loop: ↑/↓ (or k/j) step through it, a group's hotkey tags the focused pair.
import { useEffect, useMemo, useRef } from "react";
import { focusPair } from "../../actions";
import { TYPE_COLORS } from "../../core/colors";
import { visibleLinks } from "../../core/derive";
import { orderedPairs } from "../../core/pairs";
import { store } from "../../core/store";
import { useStore } from "../useStore";

const WINDOW = 120;   // rows drawn around the focused pair; the rest stay virtual

export function PairList() {
  const s = useStore();
  const list = useMemo(() => orderedPairs(visibleLinks(s.links, s.filters, s.neurons), s.neurons, s.pairOrder), [s.links, s.filters, s.neurons, s.pairOrder]);
  const at = s.focus?.kind === "pair" ? list.findIndex((l) => s.focus?.kind === "pair" && l.ref === s.focus.ref && l.tgt === s.focus.tgt) : -1;
  const start = Math.max(0, Math.min(at - WINDOW / 2, list.length - WINDOW));
  const rows = list.slice(start, start + WINDOW);
  const focusedRef = useRef<HTMLButtonElement>(null);
  // scroll only the list: scrollIntoView would also scroll the page and the 3D panel layer around it
  useEffect(() => {
    const row = focusedRef.current;
    let box = row?.parentElement ?? null;
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (!row || !box) return;
    const [r, b] = [row.getBoundingClientRect(), box.getBoundingClientRect()];
    const k = b.height / box.offsetHeight || 1;   // a panel in 3D is drawn scaled
    if (r.top < b.top) box.scrollTop -= (b.top - r.top) / k;
    else if (r.bottom > b.bottom) box.scrollTop += (r.bottom - b.bottom) / k;
  }, [at]);
  const hotkeys = Object.entries(s.groupMeta).filter(([, m]) => m.hotkey).sort((a, b) => a[1].hotkey.localeCompare(b[1].hotkey));

  return (
    <div className="pairlist">
      <div className="row wrap">
        <span className="muted">{list.length} pairs{at >= 0 ? ` · ${at + 1} focused` : ""}</span>
        <span className="grow" />
        <span className="muted">order</span>
        <select value={s.pairOrder} onChange={(e) => store.set({ pairOrder: e.target.value as typeof s.pairOrder })}>
          <option value="strength">strength</option>
          <option value="ref">ref → tgt</option>
          <option value="type">type</option>
        </select>
      </div>
      <div className="muted keys">↑ ↓ or k j: step · Esc: clear · shift S / U / D: selected / unselected / deleted</div>
      {hotkeys.length > 0 && (
        <div className="chips">
          {hotkeys.map(([name, m]) => (
            <span key={name} className="tag" style={m.color ? { borderColor: m.color, boxShadow: `inset 3px 0 0 ${m.color}` } : undefined} title={m.notes}>
              <b>{m.hotkey}</b> {name}
            </span>
          ))}
        </div>
      )}
      <div className="pairrows">
        {start > 0 && <div className="muted">… {start} above</div>}
        {rows.map((l, i) => {
          const focused = start + i === at;
          return (
            <button key={`${l.ref}-${l.tgt}`} ref={focused ? focusedRef : undefined} className={`pairrow${focused ? " on" : ""} ${l.state}`} onClick={() => focusPair(l.ref, l.tgt)}>
              <i style={{ background: TYPE_COLORS[l.type] }} />
              <span>#{s.neurons[l.ref]?.id}→#{s.neurons[l.tgt]?.id}</span>
              <span className="grow chips-inline">
                {l.groups.filter((g) => !g.startsWith("__")).slice(0, 3).map((g) => (   // "__" groups are the GUI's own bookkeeping
                  <em key={g} style={{ background: s.groupMeta[g]?.color || undefined }}>{g}</em>
                ))}
              </span>
              <span className="num">{l.strength}</span>
            </button>
          );
        })}
        {start + WINDOW < list.length && <div className="muted">… {list.length - start - WINDOW} below</div>}
      </div>
    </div>
  );
}
