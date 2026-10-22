// Selection and transforms in 3D. A click selects the nearest object under it (empty space deselects); the gizmo's
// handles (at its top-left corner) and a drag on an object's body move it live on its own group; the store takes the pose on release.
import { useEffect, type RefObject } from "react";
import { Quaternion, Vector3, type Object3D, type Raycaster } from "three";
import { addCcgPanel, addNetwork, moveNetwork, patchPanel } from "../../actions";
import { axisQuat, type Quat, type Vec3 } from "../../core/stats";
import { same3, selection3 } from "../../core/select";
import { PANEL_PX, store, type Picked3 } from "../../core/store";
import { dockedOn } from "../../core/grid";
import { duplicateGrid, patchGrid } from "../../gridActions";
import { pick3, slideBoard } from "../../stackActions";
import { duplicateTest, sceneFrame } from "../../statsActions";
import { anchors, centers } from "./tie/portAt";

export const TRIAD = "triad";

export const bodies = new Map<string, Object3D>();
export const bodyKey = (p: Picked3) => `${p.kind}:${p.id}`;

/** Mark and register an object's root group; spread the result on that group. */
export function useBody(kind: Picked3["kind"], id: string, group: RefObject<Object3D | null>): { userData: { pick: Picked3 } } {
  useEffect(() => {
    const key = bodyKey({ kind, id });
    bodies.set(key, group.current!);
    return () => void bodies.delete(key);
  }, [kind, id]);
  return { userData: { pick: { kind, id } } };
}

/** What the ray meets first: an object, the gizmo, or nothing. */
const hits = (raycaster: Raycaster, scene: Object3D) => {
  const solids: Object3D[] = [];
  scene.traverse((o) => (o.type === "Mesh" || o.type === "InstancedMesh") && solids.push(o));
  return raycaster.intersectObjects(solids, false);
};

export function rayPick(raycaster: Raycaster, scene: Object3D): Picked3 | typeof TRIAD | null {
  for (const hit of hits(raycaster, scene)) {
    for (let o: Object3D | null = hit.object; o; o = o.parent) {
      const pick = o.userData.pick as Picked3 | typeof TRIAD | undefined;
      if (pick) return pick;
    }
  }
  return null;
}

/** A click: the object under it is selected (Shift or ⌘ adds it); empty space deselects; the gizmo keeps the selection. */
export function pickAt(raycaster: Raycaster, scene: Object3D): void {
  // a CCG card's click picks its pair: the grid around it stays as selected as it was
  if (hits(raycaster, scene)[0]?.object.userData.card) return;
  const hit = rayPick(raycaster, scene);
  if (hit === TRIAD) return;
  if (hit) pick3(hit.kind, hit.id);
  else store.set({ picked3: null, more3: [], gizmo: false });
}

/** What moves this way: everything but the cables. */
export const movable = (p: Picked3) => p.kind !== "tie" && p.kind !== "cable";

/** What a press anywhere on it carries: the open session's network fills the view, so a drag on it pans and only its bar moves it. */
export const carried = (p: Picked3) => movable(p) && !(p.kind === "network" && p.id === "main");

/** An object's pose as stored, where its gizmo sits, and the point it turns about; null while it is not drawn. */
export type Placement = { p: Vec3; q: Quaternion; at: Vector3; pivot: Vector3; turns: boolean; size: number };

/** A docked CCG panel moves as part of its grid. */
export const hostOf = (p: Picked3): Picked3 => {
  const grid = p.kind === "panel" ? dockedOn(store.get(), p.id) : undefined;
  return grid ? { kind: "grid", id: grid } : p;
};

export function placeOf(p: Picked3): Placement | null {
  p = hostOf(p);
  const s = store.get();
  if (p.kind === "board") {
    const b = s.stats.boards.find((x) => x.id === p.id);
    const c = centers.get(`board:${p.id}`);
    const a = anchors.get(p.id);
    return b && c && a ? { p: b.pose.p, q: new Quaternion(...b.pose.q), at: a.at.clone(), pivot: c.at.clone(), turns: true, size: c.size } : null;
  }
  if (p.kind === "grid") {
    const g = s.grids.find((x) => x.id === p.id);
    const c = centers.get(`grid:${p.id}`);
    const a = anchors.get(`grid:${p.id}`);
    return g && c && a ? { p: g.p, q: new Quaternion(...g.q), at: a.at.clone(), pivot: c.at.clone(), turns: true, size: c.size } : null;
  }
  if (p.kind === "network") {
    // the open session's network is placed by its offset, centred where its layout puts it
    const pos = p.id === "main" ? s.mainAt : s.networks.find((x) => x.id === p.id)?.p;
    const at = pos && (p.id === "main" ? new Vector3(...sceneFrame().center).add(new Vector3(...pos)) : new Vector3(...pos));
    return pos && at ? { p: pos, q: new Quaternion(), at, pivot: at.clone(), turns: false, size: Infinity } : null;
  }
  if (p.kind === "panel") {
    const panel = s.panels.find((x) => x.id === p.id);
    if (!panel?.pose) return null;
    const q = new Quaternion(...panel.pose.q);
    const k = PANEL_PX * s.objectScale * (panel.pose.s ?? 1);
    const centre = new Vector3(...panel.pose.p);
    const corner = new Vector3((-panel.w * k) / 2, ((panel.collapsed ? 32 : panel.h) * k) / 2, 0).applyQuaternion(q).add(centre);
    return { p: panel.pose.p, q, at: corner, pivot: centre, turns: true, size: panel.w * k };
  }
  return null;
}

/** The pose after moving by *shift* and turning by *turn* about the pivot. */
export function transformed(from: Placement, shift: Vector3, turn: Quaternion): { p: Vec3; q: Quat } {
  const p = new Vector3(...from.p).sub(from.pivot).applyQuaternion(turn).add(from.pivot).add(shift);
  return { p: p.toArray() as Vec3, q: turn.clone().multiply(from.q).toArray() as Quat };
}

/** Show a transform on the object's own group while dragging; a panel has none and takes it through the store. */
export function preview(p: Picked3, from: Placement, start: { position: Vector3; quaternion: Quaternion } | null, shift: Vector3, turn: Quaternion): void {
  p = hostOf(p);
  const body = bodies.get(bodyKey(p));
  if (!body || !start) return commit(p, transformed(from, shift, turn));
  body.position.copy(start.position).sub(from.pivot).applyQuaternion(turn).add(from.pivot).add(shift);
  body.quaternion.copy(turn).multiply(start.quaternion);
}

export function commit(p: Picked3, pose: { p: Vec3; q: Quat }): void {
  p = hostOf(p);
  const s = store.get();
  if (p.kind === "board") slideBoard(p.id, pose.p, pose.q);
  else if (p.kind === "grid") patchGrid(p.id, pose);
  else if (p.kind === "network") moveNetwork(p.id, pose.p);
  else if (p.kind === "panel") patchPanel(p.id, { pose: { ...s.panels.find((x) => x.id === p.id)!.pose!, ...pose } });
}

/** The rest of the selection as a drag of *lead* starts: they move and turn with it, rigidly, about its pivot. */
export type Group3 = { p: Picked3; from: Placement; start: ReturnType<typeof startOf> }[];

/** A board and the network it is tied to move as one. */
const partners = (p: Picked3): Picked3[] => store.get().ties.flatMap((t): Picked3[] =>
  p.kind === "board" && t.board === p.id ? [{ kind: "network" as const, id: t.network }] : p.kind === "network" && t.network === p.id ? [{ kind: "board" as const, id: t.board }] : []);

export function groupOf(lead: Picked3, pivot: Vector3, withSelection = true): Group3 {
  const seen = [hostOf(lead)];
  const members = withSelection ? selection3(store.get()) : [];
  return [...members, ...[lead, ...members].flatMap(partners)].filter((o) => movable(o) && !seen.some((x) => same3(x, hostOf(o))) && seen.push(hostOf(o))).flatMap((o) => {
    const from = placeOf(o);
    return from ? [{ p: o, from: { ...from, pivot }, start: startOf(o) }] : [];
  });
}

export const previewGroup = (group: Group3, shift: Vector3, turn: Quaternion) => group.forEach((m) => preview(m.p, m.from, m.start, shift, turn));

export const commitGroup = (group: Group3, shift: Vector3, turn: Quaternion) => group.forEach((m) => commit(m.p, transformed(m.from, shift, turn)));

/** The group's pose as a drag starts, so the preview is relative to it. */
export const startOf = (p: Picked3) => {
  const body = bodies.get(bodyKey(hostOf(p)));
  return body ? { position: body.position.clone(), quaternion: body.quaternion.clone() } : null;
};

/** What a click on *target*'s menu acts on: the whole selection when it is in it, else just it. */
export const actsOn = (target: Picked3): Picked3[] => {
  const all = selection3(store.get());
  return all.some((p) => same3(p, target)) ? all : [target];
};

/** A copy of each that can be copied, a little to its right: boards, grids, CCG panels, network copies. */
export function duplicate3(targets: Picked3[]): void {
  const s = store.get();
  for (const t of targets) {
    if (t.kind === "grid") duplicateGrid(t.id);
    else if (t.kind === "board") duplicateTest(t.id);
    else if (t.kind === "panel" && ["ccg", "legend"].includes(s.panels.find((p) => p.id === t.id)!.kind)) addCcgPanel(t.id);
    else if (t.kind === "network" && t.id !== "main") {
      const { center, extent } = sceneFrame();
      addNetwork(s.networks.find((n) => n.id === t.id)!.segment, center, extent);
    }
  }
}

/** Turn each to *q*, about its own middle. */
const turnTo = (targets: Picked3[], q: Quaternion) => {
  for (const t of targets.filter(movable)) {
    const from = placeOf(t);
    if (from?.turns) commit(t, transformed(from, new Vector3(), q.clone().multiply(from.q.clone().invert())));
  }
};

/** Turn the others to *lead*'s orientation. */
export function align3(lead: Picked3, targets: Picked3[]): void {
  const to = placeOf(lead);
  if (to) turnTo(targets.filter((x) => !same3(x, lead)), to.q);
}

/** Face *target*, or its whole selection, toward an axis. */
export const snap3 = (target: Picked3, axis: string) => turnTo(actsOn(target), new Quaternion(...axisQuat(axis)));
