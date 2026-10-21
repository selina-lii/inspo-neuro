// A stats-row picker: a button showing the choice, a popover list to change it. As in the Qt picker, nothing picked snaps to every item
// unless `empty` names what nothing means.
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Open state that closes when the pointer goes down outside `ref`. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return { open, setOpen, ref };
}

type Props = {
  plural: string;
  items: string[];
  selected: string[];
  onChange(next: string[]): void;
  single?: boolean;
  disabled?: string[];
  display?: (item: string) => string;
  locked?: boolean;   // the cell follows the row above: shown, not edited
  empty?: string;   // what an empty pick means; unset = it becomes every item
  extra?: ReactNode;
};

export function ListPicker({ plural, items, selected, onChange: set, single = false, disabled = [], display = (x) => x, locked = false, empty, extra }: Props) {
  const { open, setOpen, ref } = usePopover();
  const [query, setQuery] = useState("");
  const onChange = (next: string[]) => set(next.length || single || empty ? next : items.filter((i) => !disabled.includes(i)));
  const all = !single && items.length > 0 && items.every((i) => selected.includes(i));
  const label = selected.length === 0 ? (empty ?? "—") : all ? `all ${plural}` : selected.length <= 2 ? selected.map(display).join(", ") : `${selected.length} ${plural}`;
  const shown = items.filter((i) => display(i).toLowerCase().includes(query.toLowerCase()));
  const toggle = (item: string) => {
    if (single) return onChange([item]), setOpen(false);
    onChange(selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]);
  };

  return (
    <div className={`picker${locked ? " locked" : ""}`} ref={ref}>
      <button className={selected.length ? "on" : ""} disabled={locked} title={selected.map(display).join("\n")} onClick={() => setOpen(!open)}>
        {locked ? "↑ " : ""}{label} ▾
      </button>
      {open && (
        <div className="picker-pop">
          <div className="row">
            <input autoFocus placeholder={`filter ${plural}`} value={query} onChange={(e) => setQuery(e.target.value)} />
            {!single && !all && <button className="linkish" onClick={() => onChange([])}>{empty ?? "all"}</button>}
            {extra}
          </div>
          <div className="picker-list">
            {shown.map((item) => (
              <label key={item} className={disabled.includes(item) ? "muted" : ""}>
                <input type={single ? "radio" : "checkbox"} disabled={disabled.includes(item)} checked={selected.includes(item)} onChange={() => toggle(item)} />
                {display(item)}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
