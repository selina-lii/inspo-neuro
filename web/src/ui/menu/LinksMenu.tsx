// Which links show: type, state, group and rule set, and the screens on top.
import { TYPE_COLORS } from "../../core/colors";
import { ALL_TYPES, store } from "../../core/store";
import type { Link } from "../../core/types";
import { GroupPicker } from "../GroupPicker";
import { useStore } from "../useStore";
import { MenuSection } from "./Menu";

const STATES: Link["state"][] = ["sel", "unsel", "del"];
const STATE_LABEL = { sel: "selected", unsel: "unselected", del: "deleted" };

const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};

export function LinksMenu() {
  const s = useStore();
  const { filters } = s;
  const rules = [...new Set(s.links.flatMap((l) => l.rules))].sort();
  const flag = (k: "confidentOnly" | "onOnly" | "hideSameChannel" | "hideSameShank", label: string, title = "") => (
    <button className={`chip plain${filters[k] ? " on" : ""}`} title={title} onClick={() => store.setFilters({ [k]: !filters[k] })}>{label}</button>
  );
  return (
    <>
      <MenuSection title="connection type">
        {ALL_TYPES.map((t) => (
          <button key={t} className={`chip${filters.types.has(t) ? " on" : ""}`} style={{ "--c": TYPE_COLORS[t] } as React.CSSProperties}
            onClick={() => store.setFilters({ types: toggle(filters.types, t) })}><i />{t}</button>
        ))}
      </MenuSection>
      <MenuSection title="pair state">
        {STATES.map((st) => (
          <button key={st} className={`chip plain${filters.states.has(st) ? " on" : ""}`} onClick={() => store.setFilters({ states: toggle(filters.states, st) })}>{STATE_LABEL[st]}</button>
        ))}
      </MenuSection>
      <MenuSection title="group and rule set">
        <GroupPicker />
        <select value={filters.rule} onChange={(e) => store.setFilters({ rule: e.target.value })}>
          <option value="">any rule set</option>
          {rules.map((r) => <option key={r}>{r}</option>)}
        </select>
      </MenuSection>
      <MenuSection title="screens">
        {flag("confidentOnly", "confident fit only")}
        {flag("onOnly", "on in segment only", "hide links that are off in their map's segment")}
        {flag("hideSameChannel", "hide same channel")}
        {flag("hideSameShank", "hide same shank")}
      </MenuSection>
      <MenuSection title="min strength">
        <input type="range" min={0} max={30} step={0.5} value={filters.minStrength} onChange={(e) => store.setFilters({ minStrength: Number(e.target.value) })} />
        <span className="label num">{filters.minStrength.toFixed(1)}</span>
      </MenuSection>
    </>
  );
}
