// The one pointer gesture in progress in the 3D view. Whatever drags — the camera, an object, the gizmo, a cable, a
// handle — starts a gesture on its press; the pointer's moves go to it, and the release (or Esc, or the window losing
// focus) ends it. A new gesture ends the one before, so two can never fight over the pointer.
import { Plane, Quaternion, Raycaster, Vector2, Vector3, type Camera } from "three";
import { selected3 } from "../../core/select";
import { store, type Picked3 } from "../../core/store";
import { pick3 } from "../../stackActions";
import { commit, commitGroup, groupOf, placeOf, preview, previewGroup, startOf, transformed } from "./select3";

export type Gesture = {
  move(ray: Raycaster, e: PointerEvent): void;
  end(): void;
  /** "click": it follows the pointer with no button held, and the next press sets it down (and does nothing else). */
  until?: "release" | "click";
};

let active: Gesture | null = null;
let view: { camera: Camera; canvas: HTMLElement } | null = null;
const ray = new Raycaster();

/** The camera and canvas rays are cast from: the controls register them. */
export const setGestureView = (camera: Camera, canvas: HTMLElement) => void (view = { camera, canvas });

export const dragging = () => active !== null;

export function rayAt(x: number, y: number): Raycaster {
  const r = view!.canvas.getBoundingClientRect();
  ray.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), view!.camera);
  return ray;
}

export function begin(g: Gesture): void {
  finish();
  active = g;
}

export function finish(): void {
  const g = active;
  active = null;
  g?.end();
}

/** Where the pointer last was, for a gesture that starts without a press. */
export const pointerAt = { x: 0, y: 0 };

window.addEventListener("pointermove", (e) => {
  [pointerAt.x, pointerAt.y] = [e.clientX, e.clientY];
  active?.move(rayAt(e.clientX, e.clientY), e);
});
window.addEventListener("pointerup", () => active?.until !== "click" && finish());
// capture: the press that sets a carried object down reaches nothing under it
window.addEventListener("pointerdown", (e) => active?.until === "click" && (e.stopPropagation(), finish()), true);
window.addEventListener("keydown", (e) => e.key === "Escape" && finish());
window.addEventListener("blur", finish);

export type Mode = "move" | "depth" | "turn";

/** Move an object (and the selection with it, when it is selected) from where the pointer is now: in the plane facing
 * the camera, along the view's depth, or turning about its centre. */
export function objectGesture(lead: Picked3, x: number, y: number, mode: Mode = "move", until: Gesture["until"] = "release"): Gesture | null {
  const from = placeOf(lead);
  if (!from) return null;
  const camera = view!.camera;
  const plane = new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), from.pivot);
  const grab = rayAt(x, y).ray.intersectPlane(plane, new Vector3()) ?? from.pivot.clone();
  const group = groupOf(lead, from.pivot, selected3(store.get(), lead.kind, lead.id));
  const start = startOf(lead);
  let [shift, turn] = [new Vector3(), new Quaternion()];
  let moved = false;
  return {
    until,
    move(r, e) {
      const [dx, dy] = [e.clientX - x, e.clientY - y];
      if (mode === "move") shift = r.ray.intersectPlane(plane, new Vector3())?.sub(grab) ?? shift;
      else if (mode === "depth") shift = camera.getWorldDirection(new Vector3()).multiplyScalar(-dy * camera.position.distanceTo(from.pivot) * 0.004);
      else if (from.turns) {
        const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        turn = new Quaternion().setFromAxisAngle(up, dx * 0.01).multiply(new Quaternion().setFromAxisAngle(right, dy * 0.01));
      }
      moved = true;
      preview(lead, from, start, shift, turn);
      previewGroup(group, shift, turn);
    },
    end() {
      if (!moved) return;
      commit(lead, transformed(from, shift, turn));
      commitGroup(group, shift, turn);
      if (!selected3(store.get(), lead.kind, lead.id)) pick3(lead.kind, lead.id);
    },
  };
}

/** A title bar's press: drag slides the object, Alt-drag moves it in depth, Shift-drag turns it. */
export const barPress = (lead: Picked3) => (e: { button: number; altKey: boolean; shiftKey: boolean; clientX: number; clientY: number; stopPropagation(): void }) => {
  if (e.button !== 0) return;
  e.stopPropagation();
  const g = objectGesture(lead, e.clientX, e.clientY, e.shiftKey ? "turn" : e.altKey ? "depth" : "move");
  if (g) begin(g);
};
