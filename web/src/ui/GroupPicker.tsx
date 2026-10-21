// Multi-select of pair groups for the link filter: a link passes if it is in any (or all) of the chosen groups.
import { useEffect, useRef, useState } from "react";
import { store } from "../core/store";
import { useStore } from "./useStore";

export function GroupPicker() {
  const s = useStore();
  const { groups, groupMode } = s.filters;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const counts = new Map<string, number>();
  for (const l of s.links) for (const g of l.groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  const names = s.pairGroups.filter((g) => g.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const toggle = (g: string) => {
    const next = new Set(groups);
    if (!next.delete(g)) next.add(g);
    store.setFilters({ groups: next });
  };
  const label = groups.size === 0 ? "any group" : groups.size <= 2 ? [...groups].join(groupMode === "all" ? " & " : " | ") : `${groups.size} groups (${groupMode})`;

  return (
    <div className="picker" ref={ref}>
      <button className={groups.size ? "on" : ""} onClick={() => setOpen(!open)}>
        {label} ▾
      </button>
      {open && (
        <div className="picker-pop">
          <div className="row">
            <input autoFocus placeholder="filter groups" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="seg small">
              {(["any", "all"] as const).map((m) => (
                <button key={m} className={groupMode === m ? "on" : ""} onClick={() => store.setFilters({ groupMode: m })} title={m === "any" ? "in at least one chosen group" : "in every chosen group"}>
                  {m}
                </button>
              ))}
            </div>
            {groups.size > 0 && (
              <button className="linkish" onClick={() => store.setFilters({ groups: new Set() })}>
                clear
              </button>
            )}
          </div>
          <div className="picker-list">
            {names.map((g) => (
              <label key={g} className={counts.get(g) ? "" : "muted"}>
                <input type="checkbox" checked={groups.has(g)} onChange={() => toggle(g)} />
                {g}
                <span className="grow" />
                <span className="num muted">{counts.get(g) ?? 0}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
