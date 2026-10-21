// One menu of the menu bar: a button that drops a panel of controls; a press outside it or Esc closes it.
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Menu({ label, children, wide = false }: { label: string; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="menu" ref={box}>
      <button className={`menu-btn${open ? " on" : ""}`} onClick={() => setOpen(!open)}>{label}</button>
      {open && <div className={`menu-drop${wide ? " wide" : ""}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

/** A titled group of controls inside a menu. */
export function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="menu-sec">
      <div className="menu-sec-title">{title}</div>
      <div className="menu-sec-body">{children}</div>
    </div>
  );
}
