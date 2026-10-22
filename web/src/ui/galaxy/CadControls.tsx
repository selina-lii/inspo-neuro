// CAD-style camera (SolidWorks mapping): middle-drag rotates about the point under the cursor, Ctrl+middle pans,
// Shift+middle and the wheel zoom at the cursor. On a trackpad: drag pans, ⌘/ctrl+drag rotates, pinch zooms.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { Matrix4, Object3D, PerspectiveCamera, Plane, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import { carryPanels } from "./Panels3D";
import { modKey, onStopMoves, pointer, secondary } from "./pointer";
import { carried, commit, commitGroup, groupOf, pickAt, placeOf, preview, previewGroup, rayPick, startOf, transformed, type Group3, type Placement } from "./select3";
import { selected3 } from "../../core/select";
import { store, type Picked3 } from "../../core/store";
import { pick3 } from "../../stackActions";

export type CadHandle = {
  target: Vector3;
  update(): void;
  /** Look along `-dir` at the target (dir points from target to camera), with `up` on screen. */
  view(dir: Vector3, up: Vector3): void;
  /** Bring `at` to the middle of the view from where the camera looks now, near enough to see `size`. */
  center(at: Vector3, size: number): void;
  /** Look straight at `center` from `normal`'s side, far enough to see `size`. */
  look(center: Vector3, normal: Vector3, up: Vector3, size: number): void;
};

type Mode = "rotate" | "pan" | "zoom";
type Tween = { t0: number; p0: Vector3; p1: Vector3; q0: Quaternion; q1: Quaternion; c0: Vector3; c1: Vector3; up: Vector3 };

const START_PX = 3;
const TWEEN_MS = 350;
const MIN_VIEW = 3;   // 3D units the orbit target keeps ahead of the camera
const NEAR_SHARE = 0.06;   // a hit closer than this share of the view distance is passed through when zooming in

export function CadControls({ ref }: { ref?: Ref<CadHandle> }) {
  const { camera, gl, scene, set } = useThree();
  const target = useMemo(() => new Vector3(), []);
  const tween = useRef<Tween | null>(null);

  const handle = useMemo<CadHandle>(() => {
    // a jump to a view carries the panels along; centering on or facing one item leaves everything where it is
    const goTo = (pos: Vector3, center: Vector3, up: Vector3, carry = true) => {
      const q1 = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(pos, center, up));
      const one = new Vector3(1, 1, 1);
      if (carry) carryPanels(new Matrix4().compose(camera.position, camera.quaternion, one), new Matrix4().compose(pos, q1, one));
      tween.current = { t0: performance.now(), p0: camera.position.clone(), p1: pos, q0: camera.quaternion.clone(), q1, c0: target.clone(), c1: center.clone(), up: up.clone() };
    };
    const distFor = (radius: number) => radius / Math.sin(((camera as PerspectiveCamera).fov * Math.PI) / 360);
    return {
      target,
      update: () => camera.lookAt(target),
      view: (dir, up) => goTo(target.clone().addScaledVector(dir.clone().normalize(), camera.position.distanceTo(target)), target, up),
      center: (at, size) => goTo(at.clone().addScaledVector(camera.position.clone().sub(target).normalize(), distFor(size / 2) * 1.2), at, camera.up.clone(), false),
      look: (center, normal, up, size) => goTo(center.clone().addScaledVector(normal.clone().normalize(), distFor(size / 2) * 1.1), center, up, false),
    };
  }, [camera, scene, target]);
  useImperativeHandle(ref, () => handle, [handle]);
  // the gizmo and anything else that asks for the default controls find this one
  useEffect(() => set({ controls: handle as never }), [handle, set]);
  useEffect(() => void (import.meta.env.DEV && Object.assign(window, { neuromapCamera: camera, neuromapView: handle })), [camera, handle]);

  useFrame(() => {
    const tw = tween.current;
    if (!tw) return;
    const k = Math.min((performance.now() - tw.t0) / TWEEN_MS, 1);
    const e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(tw.p0, tw.p1, e);
    camera.quaternion.slerpQuaternions(tw.q0, tw.q1, e);
    target.lerpVectors(tw.c0, tw.c1, e);
    if (k === 1) {
      camera.up.copy(tw.up);
      tween.current = null;
    }
  });

  useEffect(() => {
    const el = gl.domElement;
    const ray = new Raycaster();
    let drag: { mode: Mode | null; want: Mode; x: number; y: number; pivot: Vector3; moved: boolean; body: Picked3 | null } | null = null;
    // a drag that began on a movable object's body moves it in the screen plane, relative to where it was grabbed
    let carry: { pick: Picked3; from: Placement; start: ReturnType<typeof startOf>; plane: Plane; grab: Vector3; pose: ReturnType<typeof transformed> | null; group: Group3; shift: Vector3 } | null = null;

    const ndc = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      return new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    };
    /** The scene point under the cursor past `near` from the camera, else the cursor's point on the plane through the target. */
    const under = (x: number, y: number, near = 0): Vector3 => {
      ray.setFromCamera(ndc(x, y), camera);
      const solids: Object3D[] = [];   // lines are many and slow to hit-test: pivot on solid things only
      scene.traverse((o) => (o.type === "Mesh" || o.type === "InstancedMesh") && o.visible && solids.push(o));
      const hit = ray.intersectObjects(solids, false).find((h) => h.distance > near);
      if (hit) return hit.point.clone();
      const plane = new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), target);
      return ray.ray.intersectPlane(plane, new Vector3()) ?? target.clone();
    };
    const rotate = (dx: number, dy: number, pivot: Vector3) => {
      const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const q = new Quaternion().setFromAxisAngle(up, -dx * 0.006).multiply(new Quaternion().setFromAxisAngle(right, -dy * 0.006));
      camera.position.sub(pivot).applyQuaternion(q).add(pivot);
      target.sub(pivot).applyQuaternion(q).add(pivot);
      camera.quaternion.premultiply(q);
      camera.up.applyQuaternion(q);
    };
    /** Slide the view at the orbit target's depth: the same speed on screen wherever the press lands. */
    const pan = (dx: number, dy: number) => {
      const h = el.clientHeight || 1;
      const depth = Math.max(target.clone().sub(camera.position).dot(camera.getWorldDirection(new Vector3())), MIN_VIEW);
      const scale = (2 * depth * Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360)) / h;
      const move = new Vector3(-dx * scale, dy * scale, 0).applyQuaternion(camera.quaternion);
      camera.position.add(move);
      target.add(move);
    };
    const zoomAt = (point: Vector3, factor: number) => {
      camera.position.sub(point).multiplyScalar(factor).add(point);
      target.sub(point).multiplyScalar(factor).add(point);
      // the target stays a little ahead: were the view distance to shrink with every step, zoom would stall
      const ahead = camera.getWorldDirection(new Vector3());
      const d = target.clone().sub(camera.position).dot(ahead);
      if (d < MIN_VIEW) target.copy(camera.position).addScaledVector(ahead, MIN_VIEW);
    };

    const onDown = (e: PointerEvent) => {
      tween.current = null;
      if (secondary(e)) return;
      const mod = modKey(e);
      const want: Mode = e.button === 1 ? (mod ? "pan" : e.shiftKey ? "zoom" : "rotate") : mod ? "rotate" : "pan";
      ray.setFromCamera(ndc(e.clientX, e.clientY), camera);
      const hit = e.button === 0 && !mod ? rayPick(ray, scene) : null;
      const body = hit && hit !== "triad" && carried(hit) ? hit : null;
      drag = { mode: null, moved: false, body, want, x: e.clientX, y: e.clientY, pivot: e.button === 1 || e.button === 0 ? under(e.clientX, e.clientY) : target.clone() };
      if (e.button === 1) e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const [dx, dy] = [e.clientX - drag.x, e.clientY - drag.y];
      if (Math.hypot(dx, dy) >= START_PX) drag.moved = true;
      if (pointer.busy && !carry) return;
      // an object's own handler (title bar, corner, gizmo) already holds the pointer by the time it moves
      if (!carry && drag.moved && !drag.mode && drag.body) {
        const from = placeOf(drag.body);
        if (from) {
          const plane = new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), from.at);
          ray.setFromCamera(ndc(drag.x, drag.y), camera);
          // a selected object carries the rest of the selection with it
          const group = groupOf(drag.body, from.pivot, selected3(store.get(), drag.body.kind, drag.body.id));
          carry = { pick: drag.body, from, start: startOf(drag.body), plane, grab: ray.ray.intersectPlane(plane, new Vector3()) ?? from.at.clone(), pose: null, group, shift: new Vector3() };
          pointer.busy = true;
          el.setPointerCapture(e.pointerId);
        }
      }
      if (carry) {
        ray.setFromCamera(ndc(e.clientX, e.clientY), camera);
        const now = ray.ray.intersectPlane(carry.plane, new Vector3());
        if (!now) return;
        const shift = now.sub(carry.grab);
        carry.shift = shift;
        carry.pose = transformed(carry.from, shift, new Quaternion());
        preview(carry.pick, carry.from, carry.start, shift, new Quaternion());
        previewGroup(carry.group, shift, new Quaternion());
        return;
      }
      if (pointer.busy) return;
      if (!drag.mode) {
        if (Math.hypot(dx, dy) < START_PX) return;
        drag.mode = drag.want;
        el.setPointerCapture(e.pointerId);
      }
      [drag.x, drag.y] = [e.clientX, e.clientY];
      if (drag.mode === "rotate") rotate(dx, dy, drag.pivot);
      else if (drag.mode === "pan") pan(dx, dy);
      else zoomAt(target, Math.exp(dy * 0.006));
    };
    const onUp = (e: PointerEvent) => {
      if (drag?.mode && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      // a press and release in place on the canvas is a click: it selects the nearest object
      // the release ends the move before anything is written: a write that fails must not leave the object on the cursor
      const [c, d] = [carry, drag];
      [carry, drag] = [null, null];
      // an object's drag holds the pointer for one press: a release it missed must not lock the camera
      pointer.busy = false;
      if (c) {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
        setDown(c);
        if (!selected3(store.get(), c.pick.kind, c.pick.id)) pick3(c.pick.kind, c.pick.id);
      } else if (d && !d.moved && e.button === 0) {
        ray.setFromCamera(ndc(e.clientX, e.clientY), camera);
        pickAt(ray, scene);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      tween.current = null;
      const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      if (factor >= 1) return zoomAt(under(e.clientX, e.clientY), factor);
      // zooming in passes through whatever is already close, toward the next thing under the cursor
      const near = Math.max(0.5, camera.position.distanceTo(target) * NEAR_SHARE);
      const point = under(e.clientX, e.clientY, near);
      if (point.distanceTo(camera.position) > near) return zoomAt(point, factor);
      // nothing farther under the cursor: fly forward along it by a step that keeps pace with the view's scale
      const step = ray.ray.direction.clone().multiplyScalar(Math.max(camera.position.distanceTo(target), MIN_VIEW) * (1 - factor));
      camera.position.add(step);
      target.add(step);
    };
    const onMenu = (e: Event) => e.preventDefault();
    const setDown = (c: NonNullable<typeof carry>) => {
      if (c.pose) commit(c.pick, c.pose);
      commitGroup(c.group, c.shift, new Quaternion());
    };
    const stop = onStopMoves(() => {
      const c = carry;
      [carry, drag] = [null, null];
      if (c) setDown(c);
    });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onMenu);
    return () => {
      stop();
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onMenu);
    };
  }, [camera, gl, scene, target]);

  return null;
}
