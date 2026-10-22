// Right-click in the 3D space: add an object, or pick up a board, panel or network copy and carry it.
// A board's own right-click names it here first (three's handler runs before the DOM's), so the menu knows what it is on.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { closePanel, openSession, patchPanel, removeNetwork, setMainHidden } from "../../actions";
import { PANEL_TITLES } from "../map/SpacePanelNode";
import { facePanel } from "./Panels3D";
import { untie } from "../../stackActions";
import { addToNode, dropFromNode, removeGrid, removeNode, removeStyle } from "../../gridActions";
import { closeTest } from "../../statsActions";
import { AddMenu } from "../menu/AddMenu";
import { TrayMenu } from "./grid/TrayMenu";
import { store } from "../../core/store";
import { useStore } from "../useStore";
import { cut } from "../../wireActions";
import { wiresOf, type Role } from "../../core/wires";
import { begin, objectGesture, pointerAt } from "./gesture";
import { rename } from "./titleTip";
import { actsOn, align3, duplicate3, snapTo3 } from "./select3";

const WIRE_NAME: Record<Role, string> = { pairs: "pair source", config: "CCG config", legend: "legend", style: "curve style", input: "network input", tie: "network", feed: "fed test", edit: "editor" };

export type Target = { kind: "board" | "network" | "panel" | "tie" | "grid" | "node" | "style"; id: string };
let pending: Target | null = null;

/** A construct under the right-click claims it, before the menu opens; the nearest claims first, so the first claim stands. */
export const claimMenu = (target: Target) => void (pending ??= target);

/** A right press starts a fresh claim. */
export const resetClaim = () => void (pending = null);

/** Duplicate and align: on the whole selection when the menu's object is in it. */
function Many({ target, act }: { target: Target; act: (f: () => void) => () => void }) {
  const kind = target.kind;
  if (kind === "tie") return null;
  const lead = { kind, id: target.id };
  const all = actsOn(lead);
  const n = all.length > 1 ? ` (${all.length})` : "";
  return (
    <>
      {all.some((t) => t.kind === "board" || t.kind === "grid" || t.kind === "panel" || (t.kind === "network" && t.id !== "main")) && <button onClick={act(() => duplicate3(all))}>duplicate{n}</button>}
      {all.length > 1 && <button onClick={act(() => align3(lead, all))}>align the selection to this</button>}
      {all.length > 1 && <button title="turn the others to face as this does and set them flush beside it, an edge in line" onClick={act(() => snapTo3(lead, all))}>snap the selection to this</button>}
    </>
  );
}

export function SpaceMenu({ at, onClose, onCenter }: { at: { x: number; y: number } | null; onClose(): void; onCenter(t: Target, face: boolean): void }) {
  const { stats: s, networks, panels, grids, pairNodes, styleNodes } = useStore();
  const [moving, setMoving] = useState(false);
  // menu "move": the object follows the pointer, no button held, until a click or Esc sets it down
  const carry = (t: Target) => {
    const g = objectGesture(t, pointerAt.x, pointerAt.y, "move", "click");
    if (!g) return;
    setMoving(true);
    begin({ ...g, end: () => (g.end(), setMoving(false)) });
  };
  const [target, setTarget] = useState<Target | null>(null);
  useEffect(() => {
    if (at) {
      setTarget(pending);
      pending = null;
    }
  }, [at]);
  // the menu opens where clicked, kept inside the view; its grip moves it
  const menu = useRef<HTMLDivElement>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const el = menu.current;
    if (!at || !el) return;
    const fit = (p: { x: number; y: number }) => {
      const box = el.parentElement!.getBoundingClientRect();
      return { x: Math.max(4, Math.min(p.x, box.width - el.offsetWidth - 4)), y: Math.max(4, Math.min(p.y, box.height - el.offsetHeight - 4)) };
    };
    setPos(fit(at));
    // a submenu or the saved-test list grows the menu: keep it inside the view
    const observer = new ResizeObserver(() => setPos((p) => fit(p)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [at]);
  const act = (f: () => void) => () => (f(), onClose());
  const board = target?.kind === "board" ? s.tests.find((t) => t.id === target.id) : undefined;
  const net = target?.kind === "network" ? networks.find((n) => n.id === target.id) : undefined;
  const panel = target?.kind === "panel" ? panels.find((q) => q.id === target.id) : undefined;
  const grid = target?.kind === "grid" ? grids.find((g) => g.id === target.id) : undefined;
  const node = target?.kind === "node" ? pairNodes.find((n) => n.id === target.id) : undefined;
  return (
    <>
      {moving && <div className="carry-hint">moving — Esc or click to leave it here</div>}
      {at && (
        <div ref={menu} className="space-menu" style={{ left: pos.x, top: pos.y }} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          <div className="space-menu-grip" title="drag to move the menu"
            onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), (grab.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }))}
            onPointerMove={(e) => grab.current && setPos({ x: e.clientX - grab.current.dx, y: e.clientY - grab.current.dy })}
            onPointerUp={() => void (grab.current = null)}>⠿</div>
          {board ? (
            <>
              <div className="space-menu-title">{s.boards.find((b) => b.id === board.id)?.label || board.name || "unsaved test"}</div>
              <button onClick={act(() => rename({ kind: "board", id: board.id }))}>rename</button>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => carry(target!))}>move</button>
              <Many target={target!} act={act} />
              <button onClick={act(() => closeTest(board.id))}>close</button>
            </>
          ) : target?.kind === "tie" ? (
            <>
              <div className="space-menu-title">networks of {s.tests.find((t) => t.id === target.id)?.name || "unsaved test"}</div>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => carry({ kind: "board", id: target.id }))}>move (with its board)</button>
              <button onClick={act(() => untie(target.id))}>remove (untie)</button>
            </>
          ) : grid ? (
            <>
              <div className="space-menu-title">{grid.label || "CCG grid"}</div>
              <button onClick={act(() => rename({ kind: "grid", id: grid.id }))}>rename</button>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => carry(target!))}>move</button>
              <Many target={target!} act={act} />
              <TrayMenu grid={grid} act={act} />
              {wiresOf(store.get()).filter((w) => w.to === `grid:${grid.id}` || w.from === `grid:${grid.id}`).map((w) => (
                <button key={`${w.from}>${w.to}`} onClick={act(() => cut(w))}>disconnect its {WIRE_NAME[w.role]}</button>
              ))}
              <button onClick={act(() => removeGrid(grid.id))}>close</button>
            </>
          ) : node ? (
            <>
              <div className="space-menu-title">pair filter</div>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => carry(target!))}>move</button>
              <Many target={target!} act={act} />
              <button onClick={act(() => addToNode(node.id))}>add the picked or selected pairs</button>
              {node.added.length > 0 && <button onClick={act(() => dropFromNode(node.id))}>drop the picked or selected pairs</button>}
              <button onClick={act(() => removeNode(node.id))}>close</button>
            </>
          ) : target?.kind === "style" && styleNodes.some((n) => n.id === target.id) ? (
            <>
              <div className="space-menu-title">curve style</div>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => carry(target!))}>move</button>
              <button onClick={act(() => removeStyle(target.id))}>close</button>
            </>
          ) : panel ? (
            <>
              <div className="space-menu-title">{PANEL_TITLES[panel.kind]}</div>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => carry(target!))}>move</button>
              <Many target={target!} act={act} />
              <button onClick={act(() => facePanel(panel.id))}>turn it toward me</button>
              <button onClick={act(() => patchPanel(panel.id, { collapsed: !panel.collapsed }))}>{panel.collapsed ? "expand" : "collapse"}</button>
              <button onClick={act(() => closePanel(panel.id))}>close</button>
            </>
          ) : target?.kind === "network" && target.id === "main" ? (
            <>
              <div className="space-menu-title">network · {store.get().session}</div>
              <select value={store.get().session ?? ""} onChange={(e) => (openSession(e.target.value), onClose())}>
                {store.get().sessions.map((x) => <option key={x}>{x}</option>)}
              </select>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => setMainHidden(true))}>close</button>
            </>
          ) : net ? (
            <>
              <div className="space-menu-title">network · {net.segment}</div>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => carry(target!))}>move</button>
              <Many target={target!} act={act} />
              <button onClick={act(() => removeNetwork(net.id))}>remove</button>
            </>
          ) : (
            <>
              <div className="space-menu-title">add an object</div>
              <AddMenu onDone={onClose} />
            </>
          )}
        </div>
      )}
    </>
  );
}
