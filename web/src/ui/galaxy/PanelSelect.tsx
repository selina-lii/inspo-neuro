// A 3D panel is laid out magnified (RASTER) and shrunk back by its transform, so the browser would draw a native <select>'s
// list magnified too. Every select in a 3D panel opens this flat list at the page's own size instead.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Open = { select: HTMLSelectElement; x: number; y: number; w: number };

export function PanelSelect() {
  const [open, setOpen] = useState<Open | null>(null);
  useEffect(() => {
    const press = (e: MouseEvent) => {
      const select = (e.target as HTMLElement).closest?.(".panel3d select") as HTMLSelectElement | null;
      if (!select || select.disabled) return;
      e.preventDefault();
      const r = select.getBoundingClientRect();
      setOpen({ select, x: r.left, y: r.bottom + 2, w: r.width });
    };
    window.addEventListener("mousedown", press, true);
    return () => window.removeEventListener("mousedown", press, true);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest?.(".panel-select")) && setOpen(null);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!open) return null;
  const choose = (value: string) => {
    open.select.value = value;
    open.select.dispatchEvent(new Event("change", { bubbles: true }));
    setOpen(null);
  };
  return createPortal(
    <div className="panel-select" style={{ left: open.x, top: open.y, minWidth: open.w }}>
      {[...open.select.options].map((o) => (
        <button key={o.value} disabled={o.disabled} className={o.value === open.select.value ? "on" : ""} onClick={() => choose(o.value)}>{o.text}</button>
      ))}
    </div>,
    document.body,
  );
}
