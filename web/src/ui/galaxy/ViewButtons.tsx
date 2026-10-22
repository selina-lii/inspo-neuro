// Standard views for the 3D space, as CAD tools have them: front, top, right, iso, fit all, and straight onto a board.
import { useState, type RefObject } from "react";
import { Quaternion, Vector3 } from "three";
import type { Board } from "../../core/stats";
import type { CadHandle } from "./CadControls";

const VIEWS: [string, Vector3, Vector3, string][] = [
  ["front", new Vector3(0, 0, 1), new Vector3(0, 1, 0), "look at the x–y plane from the front"],
  ["top", new Vector3(0, 1, 0), new Vector3(0, 0, -1), "look down onto the x–z plane"],
  ["right", new Vector3(1, 0, 0), new Vector3(0, 1, 0), "look at the y–z plane from the right"],
  ["iso", new Vector3(1, 1, 1), new Vector3(0, 1, 0), "look from a corner, all three axes equally"],
];
const KEY = "neuromap:viewbar";

/** Look straight at a board's face, upright in its own plane. */
export function lookAtBoard(controls: CadHandle, board: Board, size: number): void {
  const q = new Quaternion(...board.pose.q);
  controls.look(new Vector3(...board.pose.p), new Vector3(0, 0, 1).applyQuaternion(q), new Vector3(0, 1, 0).applyQuaternion(q), size);
}

export function ViewButtons({ controls }: { controls: RefObject<CadHandle | null> }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    } catch {
      return null;
    }
  });
  const grab = (e: React.PointerEvent) => {
    const bar = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    const box = (e.currentTarget as HTMLElement).closest(".map")!.getBoundingClientRect();
    const [ox, oy] = [e.clientX - bar.left, e.clientY - bar.top];
    let last = at;
    const move = (m: PointerEvent) => setAt((last = { x: m.clientX - ox - box.left, y: m.clientY - oy - box.top }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        window.localStorage.setItem(KEY, JSON.stringify(last));
      } catch {
        // storage blocked: the bar goes back to the top on reload
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    // kept inside the view, however far it was dragged or the window has shrunk since
    <div className="view-buttons" style={at ? { left: `clamp(0px, ${at.x}px, calc(100% - 240px))`, top: `clamp(0px, ${at.y}px, calc(100% - 32px))`, transform: "none" } : undefined}>
      <span className="grip" title="drag to move this bar" onPointerDown={grab}>⠿ camera</span>
      {VIEWS.map(([name, dir, up, tip]) => (
        <button key={name} title={tip} onClick={() => controls.current?.view(dir, up)}>{name}</button>
      ))}
      <button title="zoom out until everything is in view" onClick={() => controls.current?.fit()}>fit all</button>
    </div>
  );
}
