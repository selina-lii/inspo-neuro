// Panels as objects in the 3D space: their DOM is placed by a CSS3D layer over the canvas, posed like the boards.
// Drag a title bar to move one in the view plane; click it for corner ticks that resize it; right-click for more.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { BoxGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, NoBlending, PlaneGeometry, Quaternion, Scene, Vector3, type Camera, type Object3D } from "three";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { patchPanel } from "../../actions";
import { newScale } from "../../statsActions";
import type { Quat, Vec3 } from "../../core/stats";
import { store, type SpacePanel } from "../../core/store";
import { PanelHead } from "../map/SpacePanelNode";
import { CcgBody } from "../panel/CcgPanel";
import { CcgOptionsBar, DetailBody } from "../panel/DetailPanel";
import { LegendBody } from "../panel/Legend";
import { MetadataBody } from "../panel/Metadata";
import { PairList } from "../panel/PairList";
import { StripTimeline } from "../panel/StripTimeline";
import { StatsPanel } from "../stats/StatsPanel";
import { useStore } from "../useStore";
import { claimMenu } from "./SpaceMenu";
import { PanelId } from "../panel/panelCcg";
import { anchors, ports } from "./tie/portAt";
import { PANEL_PX, TITLE_FONT } from "../../core/store";
import { selected3 } from "../../core/select";
import { pick3 } from "../../stackActions";
import { begin, dragging, objectGesture, rayAt } from "./gesture";
import { dockedOn } from "../../core/grid";
import { gridConfig } from "../../core/wires";

/** 3D units per panel pixel, at object size 1. */
export { PANEL_PX };


// the CCG panel in 3D is the extended view of a card: the plot with its controls
const CcgExtended = () => (<><CcgOptionsBar /><CcgBody /></>);
const BODY = { metadata: MetadataBody, legend: LegendBody, ccg: CcgExtended, details: DetailBody, timeline: StripTimeline, pairs: PairList, stats: StatsPanel };

const elements = new Map<string, HTMLDivElement>();
/** The objects whose toolbar is mounted: each stands on its object's anchor. */
export const bars = new Set<string>();
export const elementFor = (id: string) => elements.get(id) ?? elements.set(id, document.createElement("div")).get(id)!;
let view: { camera: Camera; host: HTMLElement; canvas: HTMLCanvasElement } | null = null;
const ahead = new Vector3();

const shown = (p: SpacePanel) => !p.closed && p.pose;
const scaleOf = (p: SpacePanel) => PANEL_PX * store.get().objectScale * (p.pose?.s ?? 1);
// a panel is laid out this many times larger and its object shrunk to match: the browser rasterises a 3D element at its
// layout size, so magnified it would blur
const RASTER = 3;

/** The wheel scrolls a panel's own content while it can; past that, or pinched, it zooms the view as over the canvas. */
function onWheel(this: HTMLElement, e: WheelEvent) {
  for (let el = e.target as HTMLElement | null; el && el !== this; el = el.parentElement) {
    const room = e.deltaY > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop : el.scrollTop;
    if (!e.ctrlKey && room > 0 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return;
  }
  e.preventDefault();
  view!.canvas.dispatchEvent(new WheelEvent("wheel", e));
}

/** A jump of the camera by the program (a view button, ⊥, fit) takes the open panels along, so they keep their place on screen. */
export function carryPanels(from: Matrix4, to: Matrix4): void {
  const move = to.clone().multiply(from.clone().invert());
  const panels = store.get().panels.map((p) => {
    if (p.closed || !p.pose) return p;
    const m = move.clone().multiply(new Matrix4().compose(new Vector3(...p.pose.p), new Quaternion(...p.pose.q), new Vector3(1, 1, 1)));
    const [at, turn] = [new Vector3(), new Quaternion()];
    m.decompose(at, turn, new Vector3());
    return { ...p, pose: { ...p.pose, p: at.toArray() as Vec3, q: turn.toArray() as Quat } };
  });
  store.set({ panels });
}

/** Turn a panel to face the viewer, upright. */
export const facePanel = (id: string) => {
  const p = store.get().panels.find((q) => q.id === id)!;
  const at = new Vector3(...p.pose!.p);
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(view!.camera.position, at, new Vector3(0, 1, 0)));
  patchPanel(id, { pose: { ...p.pose!, q: q.toArray() as Quat } });
};

/** Where unplaced panels go around the network's box: a column left of it, a row under it, the stats editor above. */
const SPOT: Record<SpacePanel["kind"], "left" | "below" | "above"> = { ccg: "left", details: "left", pairs: "left", metadata: "left", timeline: "below", legend: "below", stats: "above" };

export type SceneBox = { x0: number; x1: number; y0: number; y1: number; z: number };

/** Inside the canvas: give unplaced panels a place beside the network, and draw every panel at its pose. */
export function PanelLayer({ host, box }: { host: RefObject<HTMLDivElement | null>; box: SceneBox }) {
  const { panels, objectScale } = useStore();
  const { camera, gl, scene: world } = useThree();
  const renderer = useMemo(() => new CSS3DRenderer(), []);
  const scene = useMemo(() => new Scene(), []);
  const objects = useMemo(() => new Map<string, CSS3DObject>(), []);
  useEffect(() => {
    const el = host.current!;
    renderer.domElement.className = "panel-layer";
    el.appendChild(renderer.domElement);
    view = { camera, host: el, canvas: gl.domElement };
    return () => void el.removeChild(renderer.domElement);
  }, [camera]);
  useEffect(() => {
    const at = { left: box.y1, below: box.y0 - 1.5, above: box.y1 + 1.5 };
    const k = newScale();
    for (const p of panels.filter((q) => !q.pose)) {
      const [w, h] = [p.w * PANEL_PX * objectScale * k, (p.collapsed ? 32 : p.h) * PANEL_PX * objectScale * k];
      const spot = SPOT[p.kind];
      const x = spot === "left" ? box.x0 - 1.5 - w / 2 : box.x0 + w / 2;
      const y = spot === "above" ? at.above + h / 2 : at[spot] - h / 2;
      if (spot === "above") at.above += h + 0.5;
      else at[spot] -= h + 0.5;
      patchPanel(p.id, { pose: { p: [x, y, box.z], q: [0, 0, 0, 1], s: k } });
    }
  }, [panels, box]);
  useEffect(() => {
    // an opened panel comes to the middle of the view, facing the camera
    for (const p of panels.filter((q) => q.summon && !q.closed)) {
      const c = view!.camera;
      const ahead = c.getWorldDirection(new Vector3());
      const k = p.pose?.s ?? newScale();
      // far enough that the panel, at the shared scale, fills about half the view
      const dist = p.h * PANEL_PX * store.get().objectScale * k * 1.6;
      patchPanel(p.id, { summon: false, pose: { p: c.position.clone().addScaledVector(ahead, dist).toArray() as Vec3, q: c.quaternion.toArray() as Quat, s: k } });
    }
  }, [panels]);
  useFrame((st) => {
    // the renderer's own size: a hot reload makes a new renderer while refs survive
    const now = renderer.getSize();
    if (now.width !== st.size.width || now.height !== st.size.height) renderer.setSize(st.size.width, st.size.height);
    const want = store.get().panels.filter(shown);
    for (const [id, o] of objects) if (!id.startsWith("bar:") && !want.some((p) => p.id === id)) (scene.remove(o), objects.delete(id));
    for (const p of want) {
      let o = objects.get(p.id);
      if (!o) objects.set(p.id, (o = new CSS3DObject(elementFor(p.id)))), scene.add(o), (o.element.style.opacity = "");
      o.position.fromArray(p.pose!.p);
      o.quaternion.fromArray(p.pose!.q);
      o.scale.setScalar(scaleOf(p) / RASTER);
      // a CCG panel cabled to one grid alone sits on it, above its toolbar, and goes where the grid goes
      const host = dockedOn(store.get(), p.id);
      const a = host ? anchors.get(`grid:${host}`) : undefined;
      if (a) {
        const bar = objects.get(`bar:grid:${host}`);
        o.scale.setScalar((a.scale * PANEL_PX) / RASTER);   // at the grid's scale, so its title matches the grid's
        const lift = (bar ? bar.element.offsetHeight * bar.scale.x : 0) + 0.1 + (o.element.offsetHeight * o.scale.x) / 2;
        o.quaternion.copy(a.q);
        // a legend sits right of the grid's CCG panel when that is docked too
        const cfg = p.kind === "legend" && host ? gridConfig(store.get(), host) : undefined;
        const beside = cfg && dockedOn(store.get(), cfg) === host ? objects.get(cfg) : undefined;
        const x = beside ? beside.element.offsetWidth * beside.scale.x + 0.2 : 0;
        o.position.copy(a.at).add(new Vector3(x + (o.element.offsetWidth * o.scale.x) / 2, lift, 0).applyQuaternion(a.q));
      }
      // a CCG, legend or stats panel's link dot, off its top-right corner by its title row: into grids, or onto the test it edits
      if (p.kind === "ccg" || p.kind === "legend" || p.kind === "stats") {
        const k = o.scale.x;
        ports.set(`panel:${p.id}`, new Vector3((o.element.offsetWidth / 2 + 12 * RASTER) * k, (o.element.offsetHeight / 2 - 14 * RASTER) * k, 0).applyQuaternion(o.quaternion).add(o.position));
      }
      // CSS3D draws a panel behind the camera mirrored: hide it once the camera has passed it
      o.element.style.visibility = o.position.clone().sub(st.camera.position).dot(st.camera.getWorldDirection(ahead)) > 0.2 ? "" : "hidden";
    }
    // toolbars: a strip in the object's plane, its bottom-left on the object's top-left
    for (const [key, o] of objects) if (key.startsWith("bar:") && !bars.has(key.slice(4))) (scene.remove(o), objects.delete(key));
    for (const id of bars) {
      const a = anchors.get(id);
      const key = `bar:${id}`;
      let o = objects.get(key);
      if (!o) objects.set(key, (o = new CSS3DObject(elementFor(key)))), scene.add(o);
      if (!a) {
        o.element.style.visibility = "hidden";
        continue;
      }
      // its 11px text as tall as the object's title
      const k = (a.scale * TITLE_FONT) / 11;
      const el = o.element;
      o.quaternion.copy(a.q);
      o.scale.setScalar(k);
      o.position.copy(a.at).add(new Vector3((el.offsetWidth * k) / 2, (el.offsetHeight * k) / 2 + 0.05, 0).applyQuaternion(a.q));
      o.element.style.visibility = o.position.clone().sub(st.camera.position).dot(st.camera.getWorldDirection(ahead)) > 0.2 ? "" : "hidden";
      o.element.style.zIndex = String(Math.round(1e6 - o.position.distanceTo(st.camera.position) * 100));
    }
    // each page cuts its own window in the canvas at its depth: what is nearer draws over it, what is farther does not
    for (const [key, m] of holes) if (!objects.has(key)) (st.scene.remove(m), holes.delete(key));
    for (const [key, o] of objects) {
      let m = holes.get(key);
      if (!m) holes.set(key, (m = new Mesh(UNIT, HOLE))), (m.renderOrder = -1), (m.userData.hole = key), st.scene.add(m);
      m.visible = o.element.style.visibility !== "hidden";
      m.position.copy(o.position);
      m.quaternion.copy(o.quaternion);
      m.scale.set(o.element.offsetWidth * o.scale.x, o.element.offsetHeight * o.scale.x, 1);
    }
    // a thin slab behind each panel, so it still shows edge-on and from behind, where the page itself is hidden
    SLAB_MAT.color.setStyle(getComputedStyle(document.documentElement).getPropertyValue("--panel").trim() || "#ffffff");
    for (const [key, m] of slabs) if (!objects.has(key)) (st.scene.remove(m), slabs.delete(key));
    for (const [key, o] of objects) {
      if (key.startsWith("bar:")) continue;
      let m = slabs.get(key);
      if (!m) slabs.set(key, (m = new Mesh(BOX, SLAB_MAT))), st.scene.add(m);
      const depth = SLAB * store.get().objectScale;
      m.quaternion.copy(o.quaternion);
      m.position.copy(o.position).add(new Vector3(0, 0, -depth / 2 - depth * 0.1).applyQuaternion(o.quaternion));
      m.scale.set(o.element.offsetWidth * o.scale.x, o.element.offsetHeight * o.scale.x, depth);
    }
    renderer.render(scene, st.camera);
    // DOM cannot sink behind other DOM by depth: nearer panels stack above, the picked one above all; none ever fades
    const picked = store.get().picked3;
    for (const p of want) {
      const o = objects.get(p.id)!;
      o.element.style.zIndex = picked?.kind === "panel" && picked.id === p.id ? "2000000" : String(Math.round(1e6 - o.position.distanceTo(st.camera.position) * 100));
    }
  });
  const holes = useMemo(() => new Map<string, Mesh>(), []);
  const slabs = useMemo(() => new Map<string, Mesh>(), []);
  useEffect(() => {
    // the pointer goes to whichever is nearest under it: a page through its window, else the canvas
    const route = (e: PointerEvent) => {
      if (e.buttons) return;
      const ray = rayAt(e.clientX, e.clientY);
      const solids: Object3D[] = [];
      world.traverse((o) => (o.type === "Mesh" || o.type === "InstancedMesh") && o.visible && solids.push(o));
      const hit = ray.intersectObjects(solids, false)[0];
      gl.domElement.style.pointerEvents = hit?.object.userData.hole ? "none" : "";
    };
    window.addEventListener("pointermove", route, true);
    return () => window.removeEventListener("pointermove", route, true);
  }, [camera, gl, world]);
  return null;
}

// a page's window in the canvas: it clears the canvas to see-through and keeps its depth
const UNIT = new PlaneGeometry(1, 1);
const HOLE = new MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: NoBlending, side: DoubleSide });
const BOX = new BoxGeometry(1, 1, 1);
// pushed back in depth: from afar the slab's face and the page's window would otherwise tie, and the slab would hide the page
const SLAB_MAT = new MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 });
const SLAB = 0.12;   // its depth, in 3D units at objectScale 1

/** Outside the canvas: each shown panel's content, rendered into the element its CSS3D object places. */
export function Panels3D() {
  const { panels } = useStore();
  const s = useStore();
  useEffect(() => {
    // a press on the panel's own gizmo (it has just begun a gesture) keeps the panel selected
    const away = (e: PointerEvent) => !e.shiftKey && !dragging() && !(e.target as HTMLElement).closest?.(".panel3d") && store.get().picked3?.kind === "panel" && store.set({ picked3: null });
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, []);
  return <>{panels.filter(shown).map((p) => createPortal(<Panel3D panel={p} picked={selected3(s, "panel", p.id)} onPick={() => pick3("panel", p.id)} />, elementFor(p.id), p.id))}</>;
}

function Panel3D({ panel, picked, onPick }: { panel: SpacePanel; picked: boolean; onPick(e: React.PointerEvent): void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current!;
    el.addEventListener("wheel", onWheel, { passive: false });   // passive React wheel handlers cannot stop a pinch zooming the page
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const Body = BODY[panel.kind];
  // the head drags the panel through the shared transform path: a docked panel takes its grid along
  const head = {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      const g = objectGesture({ kind: "panel", id: panel.id }, e.clientX, e.clientY);
      if (g) begin(g);
    },
  };
  return (
    <div ref={root} className={`space-panel panel3d${picked ? " picked" : ""}`} style={{ width: panel.w, height: panel.collapsed ? "auto" : panel.h, zoom: RASTER }}
      onPointerDown={onPick}
      onContextMenu={(e) => (e.preventDefault(), claimMenu({ kind: "panel", id: panel.id }))}>
      <PanelHead panel={panel} {...head} />
      {!panel.collapsed && <div className="space-panel-body"><PanelId.Provider value={panel.id}><Body /></PanelId.Provider></div>}
      {picked && !panel.collapsed && <PanelCorners panel={panel} />}
    </div>
  );
}

/** Pink corner ticks; dragging one resizes the panel about its centre, in its own pixels. */
function PanelCorners({ panel }: { panel: SpacePanel }) {
  const drag = useRef<{ x: number; y: number; w: number; h: number; k: number; sx: number; sy: number } | null>(null);
  return (
    <>
      {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sy]) => (
        <div key={`${sx}${sy}`} className={`panel-tick ${sy < 0 ? "t" : "b"}${sx < 0 ? "l" : "r"}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            // screen pixels per panel pixel, as the panel is drawn now
            const k = (e.currentTarget.parentElement!.getBoundingClientRect().width || panel.w) / panel.w;
            drag.current = { x: e.clientX, y: e.clientY, w: panel.w, h: panel.h, k, sx, sy };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) patchPanel(panel.id, { w: Math.max(220, d.w + (2 * d.sx * (e.clientX - d.x)) / d.k), h: Math.max(100, d.h + (2 * d.sy * (e.clientY - d.y)) / d.k) });
          }}
          onPointerUp={() => void (drag.current = null)} />
      ))}
    </>
  );
}
 