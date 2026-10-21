// Sizes and amounts of what sits in the space: the objects in 3D and which pairs carry a CCG card.
import { store } from "../../core/store";
import { useStore } from "../useStore";
import { MenuSection } from "./Menu";

const THUMBS = { focused: "the focused pair", selected: "the focused pair and the selection", shown: "every shown link" };

export function SettingsMenu() {
  const s = useStore();
  return (
    <>
      <MenuSection title="object size in 3D (stats boards and CCG cards together)">
        <input type="range" min={0.2} max={2} step={0.05} value={s.objectScale} onChange={(e) => store.set({ objectScale: Number(e.target.value) })} />
        <span className="num">{s.objectScale.toFixed(2)}×</span>
      </MenuSection>
      <MenuSection title="CCG cards in 3D for">
        <select value={s.thumbs} onChange={(e) => store.set({ thumbs: e.target.value as typeof s.thumbs })}>
          {Object.entries(THUMBS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </MenuSection>
    </>
  );
}
