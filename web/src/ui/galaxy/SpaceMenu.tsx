// Right-click in the 3D space: add an object, or pick up a board, panel or network copy and carry it.
// A board's own right-click names it here first (three's handler runs before the DOM's), so the menu knows what it is on.
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plane, Raycaster, Vector3 } from "three";
import type { Vec3 } from "../../core/stats";
import { closePanel, moveNetwork, openSession, patchPanel, removeNetwork, setMainHidden } from "../../actions";
import { PANEL_TITLES } from "../map/SpacePanelNode";
import { facePanel } from "./Panels3D";
import { untie } from "../../stackActions";
import { patchGrid, patchNode, removeGrid, removeNode } from "../../gridActions";
import { closeTest, moveBoard } from "../../statsActions";
import { AddMenu } from "../menu/AddMenu";
import { store } from "../../core/store";
import { useStore } from "../useStore";
import { actsOn, align3, duplicate3 } from "./select3";

export type Target = { kind: "board" | "network" | "panel" | "tie" | "grid" | "node"; id: string };
let pending: Target | null = null;

/** A construct under the right-click claims it, before the menu opens; the nearest claims first, so the first claim stands. */
export const claimMenu = (target: Target) => void (pending ??= target);

/** A right press starts a fresh claim. */
export const resetClaim = () => void (pending = null);

// the construct being carried; Esc or a click sets it down where it is
let carrying: Target | null = null;
const carryListeners = new Set<(t: Target | null) => void>();
function carry(t: Target | null) {
  carrying = t;
  for (const f of carryListeners) f(t);
}

/** Inside the canvas: the carried board follows the pointer across the plane facing the camera. */
export function CarrySync() {
  const ray = useMemo(() => new Raycaster(), []);
  const plane = useMemo(() => new Plane(), []);
  const hit = useMemo(() => new Vector3(), []);
  const { stats, networks, panels, grids, pairNodes } = useStore();
  useFrame(({ camera, pointer }) => {
    if (!carrying) return;
    const board = carrying.kind === "board" ? stats.boards.find((b) => b.id === carrying!.id) : undefined;
    const net = carrying.kind === "network" ? networks.find((n) => n.id === carrying!.id) : undefined;
    const panel = carrying.kind === "panel" ? panels.find((q) => q.id === carrying!.id) : undefined;
    const grid = carrying.kind === "grid" ? grids.find((g) => g.id === carrying!.id) : undefined;
    const node = carrying.kind === "node" ? pairNodes.find((n) => n.id === carrying!.id) : undefined;
    const p = board?.pose.p ?? net?.p ?? panel?.pose?.p ?? grid?.p ?? node?.p;
    if (!p) return;
    const at = new Vector3(...p);
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()).negate(), at);
    ray.setFromCamera(pointer, camera);
    if (!ray.ray.intersectPlane(plane, hit) || hit.distanceTo(at) < 1e-3) return;
    if (board) moveBoard(board.id, { ...board.pose, p: hit.toArray() as Vec3 });
    else if (grid) patchGrid(grid.id, { p: hit.toArray() as Vec3 });
    else if (node) patchNode(node.id, { p: hit.toArray() as Vec3 });
    else if (panel) patchPanel(panel.id, { pose: { ...panel.pose!, p: hit.toArray() as Vec3 } });
    else moveNetwork(net!.id, hit.toArray() as Vec3);
  });
  return null;
}

/** Duplicate and align: on the whole selection when the menu's object is in it. */
function Many({ target, act }: { target: Target; act: (f: () => void) => () => void }) {
  const kind = target.kind;
  if (kind === "node" || kind === "tie") return null;
  const lead = { kind, id: target.id };
  const all = actsOn(lead);
  const n = all.length > 1 ? ` (${all.length})` : "";
  return (
    <>
      {all.some((t) => t.kind === "board" || t.kind === "grid" || t.kind === "panel" || (t.kind === "network" && t.id !== "main")) && <button onClick={act(() => duplicate3(all))}>duplicate{n}</button>}
      {all.length > 1 && <button onClick={act(() => align3(lead, all))}>align the selection to this</button>}
    </>
  );
}

export function SpaceMenu({ at, onClose, onCenter }: { at: { x: number; y: number } | null; onClose(): void; onCenter(t: Target, face: boolean): void }) {
  const { stats: s, networks, panels, grids, pairNodes } = useStore();
  const [moving, setMoving] = useState<Target | null>(carrying);
  const [target, setTarget] = useState<Target | null>(null);
  useEffect(() => {
    carryListeners.add(setMoving);
    return () => void carryListeners.delete(setMoving);
  }, []);
  useEffect(() => {
    if (at) {
      setTarget(pending);
      pending = null;
    }
  }, [at]);
  useEffect(() => {
    if (!moving) return;
    const stop = (e: Event) => (e instanceof KeyboardEvent ? e.key === "Escape" : true) && carry(null);
    window.addEventListener("keydown", stop);
    window.addEventListener("pointerdown", stop);
    return () => {
      window.removeEventListener("keydown", stop);
      window.removeEventListener("pointerdown", stop);
    };
  }, [moving]);

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
              <div className="space-menu-title">{board.name || "unsaved test"}</div>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => carry(target))}>move</button>
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
              <div className="space-menu-title">CCG grid</div>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => carry(target))}>move</button>
              <Many target={target!} act={act} />
              {grid.source && <button onClick={act(() => patchGrid(grid.id, { source: null }))}>disconnect its cable</button>}
              {grid.config && <button onClick={act(() => patchGrid(grid.id, { config: null }))}>disconnect its CCG config</button>}
              {grid.legend && <button onClick={act(() => patchGrid(grid.id, { legend: null }))}>disconnect its legend</button>}
              <button onClick={act(() => removeGrid(grid.id))}>close</button>
            </>
          ) : node ? (
            <>
              <div className="space-menu-title">pair filter</div>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => carry(target))}>move</button>
              <Many target={target!} act={act} />
              {node.source && <button onClick={act(() => patchNode(node.id, { source: null }))}>disconnect its input</button>}
              <button onClick={act(() => removeNode(node.id))}>close</button>
            </>
          ) : panel ? (
            <>
              <div className="space-menu-title">{PANEL_TITLES[panel.kind]}</div>
              <button onClick={act(() => onCenter(target!, false))}>center on this item</button>
              <button onClick={act(() => onCenter(target!, true))}>face me</button>
              <button onClick={act(() => carry(target))}>move</button>
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
              <button onClick={act(() => carry(target))}>move</button>
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
