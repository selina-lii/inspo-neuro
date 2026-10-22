// A pair-tag picker: every tag, or a new one named on the spot; the pick tags the pairs, or untags them when all have it.
import { realGroups } from "../../../core/colors";
import { useStore } from "../../useStore";

const NEW = "\u0000new";

export function TagSelect({ label, title, disabled, onTag }: { label: string; title: string; disabled?: boolean; onTag(group: string): void }) {
  const s = useStore();
  const pick = (value: string) => {
    const group = value === NEW ? window.prompt("new tag")?.trim() : value;
    if (group) onTag(group);
  };
  return (
    <select value="" disabled={disabled} title={title} onChange={(e) => e.target.value && pick(e.target.value)}>
      <option value="">{label}</option>
      {realGroups(s.pairGroups).map((g) => <option key={g} value={g}>{g}{s.groupMeta[g]?.hotkey ? ` (${s.groupMeta[g]!.hotkey})` : ""}</option>)}
      <option value={NEW}>new tag…</option>
    </select>
  );
}
