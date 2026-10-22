// A stats-row picker: a button showing the choice, a popover list to change it. As in the Qt picker, nothing picked snaps to every item
// unless `empty` names what nothing means.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Open state that closes when the pointer goes down outside `ref`. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // a 3D panel's select opens its list outside the popover
    const inside = (n: Node) => ref.current?.contains(n) || pop.current?.contains(n) || (n as HTMLElement).closest?.(".panel-select");
    const close = (e: PointerEvent) => ref.current && !inside(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return { open, setOpen, ref, pop };
}

/** A list click as a file list takes it: alone it picks one item, ⌘/Ctrl adds or drops one, Shift picks the run from the last click. */
export function useListClick(items: string[], selected: string[], onChange: (next: string[]) => void) {
  const anchor = useRef<string | null>(null);
  return (item: string, e: React.MouseEvent) => {
    e.preventDefault();
    const [a, b] = [items.indexOf(anchor.current ?? item), items.indexOf(item)];
    if (e.shiftKey && a >= 0) return onChange([...new Set([...(e.metaKey || e.ctrlKey ? selected : []), ...items.slice(Math.min(a, b), Math.max(a, b) + 1)])]);
    anchor.current = item;
    // a checkbox toggles its own item, as ⌘ does on the row
    onChange(e.metaKey || e.ctrlKey || (e.target as HTMLElement).tagName === "INPUT" ? (selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]) : [item]);
  };
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
  const { open, setOpen, ref, pop } = usePopover();
  const [query, setQuery] = useState("");
  const onChange = (next: string[]) => set(next.length || single || empty ? next : items.filter((i) => !disabled.includes(i)));
  const all = !single && items.length > 0 && items.every((i) => selected.includes(i));
  const label = selected.length === 0 ? (empty ?? "—") : all ? `all ${plural}` : selected.length <= 2 ? selected.map(display).join(", ") : `${selected.length} ${plural}`;
  const shown = items.filter((i) => display(i).toLowerCase().includes(query.toLowerCase()));
  const click = useListClick(shown.filter((i) => !disabled.includes(i)), selected, onChange);

  return (
    <div className={`picker${locked ? " locked" : ""}`} ref={ref}>
      <button className={selected.length ? "on" : ""} disabled={locked} title={selected.map(display).join("\n")} onClick={() => setOpen(!open)}>
        {locked ? "↑ " : ""}{label} ▾
      </button>
      {open && float(ref.current, (
        <div className="picker-pop" ref={pop}>
          <div className="row">
            <input autoFocus placeholder={`filter ${plural}`} value={query} onChange={(e) => setQuery(e.target.value)} />
            {!single && !all && <button className="linkish" onClick={() => onChange([])}>{empty ?? "all"}</button>}
            {extra}
          </div>
          <div className="picker-list">
            {shown.map((item) => (
              <label key={item} className={disabled.includes(item) ? "muted" : ""}
                onClick={(e) => !disabled.includes(item) && (single ? (onChange([item]), setOpen(false)) : click(item, e))}>
                <input type={single ? "radio" : "checkbox"} disabled={disabled.includes(item)} checked={selected.includes(item)} readOnly />
                {display(item)}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** On a 3D object's bar the list leaves the bar's plane for the screen, opening upward over the object instead of behind the canvas. */
export function float(anchor: HTMLElement | null, pop: ReactNode): ReactNode {
  if (!anchor?.closest(".board-tools")) return pop;
  const box = anchor.getBoundingClientRect();
  return createPortal(<div className="picker-float" style={{ left: box.left, bottom: window.innerHeight - box.top + 4, maxHeight: box.top - 8 }}>{pop}</div>, document.body);
}
