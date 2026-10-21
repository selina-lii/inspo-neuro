// The pieces a network is drawn from in 3D: links batched into a few fat-line objects, their arrowheads, and the neurons as
// instanced shapes. The main view and every network copy use them.
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, ConeGeometry, InstancedMesh, Matrix4, Object3D, Quaternion, SphereGeometry, Vector3 } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { clickNeuron, focusPair, select } from "../../actions";
import { neuronColors, PICK_COLOR, type LinkStyle } from "../../core/colors";
import { linkKey, type Link, type Neuron, type Point3 } from "../../core/types";
import { useStore } from "../useStore";
import type { Probe } from "./layout3";
import { curve, SEGMENTS } from "./curve";
import { modKey } from "./pointer";

const WIDTHS = [1.6, 3, 5];   // px, by strength step

export type Batch = { key: string; width: number; dashed: boolean; opacity: number; dim: boolean; halo: boolean; links: { link: Link; color: string; color2?: string }[] };

/** Links grouped by how they draw (width step, dash, dim, halo, faint): one line object per group. */
/** `focus`: a clicked pair's key; every other link drops back but stays clickable. */
export function buildBatches(drawn: Link[], styles: Map<number, LinkStyle>, o: { solo: Link | null; touch: number | null; picked: Set<string>; alpha: number; off(l: Link): boolean; focus?: string | null }): Batch[] {
  const out = new Map<string, Batch>();
  const add = (link: Link, style: LinkStyle, halo: boolean) => {
    const step = style.width < 0.3 ? 0 : style.width < 0.8 ? 1 : 2;
    const dashed = style.dashed && !halo;
    const dim = !halo && (o.solo ? link !== o.solo : o.touch !== null && link.ref !== o.touch && link.tgt !== o.touch);
    const faint = style.alpha < 0.5 && !halo;
    const hush = Boolean(o.focus) && !halo && linkKey(link.ref, link.tgt) !== o.focus;
    const key = `${step}${dashed}${dim}${halo}${faint}${hush}`;
    const batch = out.get(key) ?? { key, width: WIDTHS[step]! + (halo ? 8 : 0), dashed, dim, halo, opacity: (faint ? Math.max(style.alpha, 0.15) : 0.92) * o.alpha * (hush ? 0.2 : 1), links: [] };
    batch.links.push({ link, color: style.color, color2: style.color2 });
    out.set(key, batch);
  };
  for (const link of drawn) {
    const style = styles.get(link.i)!;
    if (link !== o.solo && o.off(link)) continue;
    if (o.picked.has(linkKey(link.ref, link.tgt))) add(link, style, true);
    add(link, style, false);
  }
  return [...out.values()];
}

/** `onPick`: a click on a link; another session's layer maps it to its own pair. */
export function LinkBatch({ batch, pts, dark, onHover, onPick = focusPair }: { batch: Batch; pts: Point3[]; dark: boolean; onHover(key: string | null): void; onPick?(ref: number, tgt: number): void }) {
  const size = useThree((t) => t.size);
  const object = useMemo(() => {
    const positionsArr: number[] = [];
    const colorsArr: number[] = [];
    const owners: string[] = [];
    const color = new Color();
    const end = new Color();
    for (const { link, color: tint, color2 } of batch.links) {
      const a = pts[link.ref];
      const b = pts[link.tgt];
      if (!a || !b) continue;
      const line = curve(new Vector3(a.x, a.y, a.z), new Vector3(b.x, b.y, b.z));
      color.set(batch.halo ? PICK_COLOR : tint);
      end.set(batch.halo ? PICK_COLOR : color2 ?? tint);
      const at = (i: number) => color.clone().lerp(end, i / (line.length - 1));
      for (let i = 0; i < line.length - 1; i++) {
        positionsArr.push(line[i]!.x, line[i]!.y, line[i]!.z, line[i + 1]!.x, line[i + 1]!.y, line[i + 1]!.z);
        const [c0, c1] = [at(i), at(i + 1)];
        colorsArr.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
        owners.push(linkKey(link.ref, link.tgt));
      }
    }
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positionsArr);
    geometry.setColors(colorsArr);
    const material = new LineMaterial({
      vertexColors: true, linewidth: batch.width, dashed: batch.dashed, dashSize: 0.18, gapSize: 0.12,
      transparent: true, opacity: batch.dim ? 0.07 : batch.halo ? 1 : batch.opacity, depthWrite: !batch.dim,
    });
    const segments = new LineSegments2(geometry, material);
    if (batch.dashed) segments.computeLineDistances();
    segments.renderOrder = batch.halo ? 0 : 1;
    segments.userData.owners = owners;
    return segments;
  }, [batch, pts, dark]);

  useEffect(() => {
    (object.material as LineMaterial).resolution.set(size.width, size.height);
  }, [object, size]);
  useEffect(() => () => {
    object.geometry.dispose();
    (object.material as LineMaterial).dispose();
  }, [object]);

  const ownerOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => (object.userData.owners as string[])[e.faceIndex ?? -1] ?? null;
  return (
    <primitive
      object={object}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (batch.dim) return;
        e.stopPropagation();
        onHover(ownerOf(e));
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (batch.dim || e.delta > 4) return;
        e.stopPropagation();
        const key = ownerOf(e);
        if (!key) return;
        const [ref, tgt] = key.split("-").map(Number) as [number, number];
        onPick(ref, tgt);
        if (modKey(e.nativeEvent)) select(new Set(), new Set([key]), true);
      }}
    />
  );
}

/** Arrowheads at each target: cones for excitatory links, flat bars for inhibitory ones. */
/** An arrowhead per link: a slim round cone, unlike the three-sided pyramids that mark pyramidal cells. */
export function Heads({ links, styles, pts, touch }: { links: Link[]; styles: Map<number, LinkStyle>; pts: Point3[]; touch: number | null }) {
  const cone = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new ConeGeometry(0.06, 0.34, 12), []);

  useEffect(() => {
    const mesh = cone.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const color = new Color();
    links.forEach((link, k) => {
      const a = pts[link.ref];
      const b = pts[link.tgt];
      if (!a || !b) return;
      const line = curve(new Vector3(a.x, a.y, a.z), new Vector3(b.x, b.y, b.z));
      const end = line[SEGMENTS]!;
      const tangent = end.clone().sub(line[SEGMENTS - 1]!).normalize();
      const tip = end.clone().addScaledVector(tangent, -0.17);
      q.setFromUnitVectors(new Vector3(0, 1, 0), tangent);
      const style = styles.get(link.i);
      const s = 0.8 + (style?.width ?? 0.3) * 0.9;
      m.compose(tip, q, new Vector3(s, s, s));
      mesh.setMatrixAt(k, m);
      color.set(style?.color2 ?? style?.color ?? "#999");
      if (touch !== null && link.ref !== touch && link.tgt !== touch) color.multiplyScalar(0.25);
      mesh.setColorAt(k, color);
    });
    mesh.count = links.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [links, pts, touch, styles]);

  return (
    <instancedMesh key={links.length} ref={cone} args={[geometry, undefined, Math.max(links.length, 1)]} raycast={() => null}>
      <meshStandardMaterial />
    </instancedMesh>
  );
}

const NO_SELECTION = { neurons: new Set<number>(), links: new Set<string>() };

const NONE_FADED = () => false;

/** Neurons: tetrahedra for pyramidal cells, spheres for interneurons, coloured by area; `faded` ones see-through. */
export function Neurons({ pts, touch, hidden, faded = NONE_FADED, onHover, layer }: {
  pts: Point3[]; touch: number | null; hidden: (idx: number) => boolean; faded?: (idx: number) => boolean; onHover(idx: number | null): void; layer?: Neuron[];   // layer: another session's neurons, drawn inert
}) {
  const s = useStore();
  const neurons = layer ?? s.neurons;
  const selection = layer ? NO_SELECTION : s.selection;
  const colors = useMemo(() => neuronColors({ ...s, neurons }).colors, [neurons, s.neuronValues, s.neuronColor]);
  const pyr = useRef<InstancedMesh>(null);
  const int = useRef<InstancedMesh>(null);
  const pyrFaded = useRef<InstancedMesh>(null);
  const intFaded = useRef<InstancedMesh>(null);
  const geometries = useMemo(() => ({ pyr: new ConeGeometry(0.2, 0.36, 3), int: new SphereGeometry(0.16, 16, 12) }), []);
  const groups = useMemo(() => {
    const of = (isPyr: boolean, f: boolean) => neurons.filter((n) => (n.type === "pyr") === isPyr && faded(n.idx) === f).map((n) => n.idx);
    return { pyr: of(true, false), int: of(false, false), pyrFaded: of(true, true), intFaded: of(false, true) };
  }, [neurons, faded]);

  useEffect(() => {
    const dummy = new Object3D();
    const color = new Color();
    for (const [mesh, members] of [[pyr.current, groups.pyr], [int.current, groups.int], [pyrFaded.current, groups.pyrFaded], [intFaded.current, groups.intFaded]] as const) {
      if (!mesh) continue;
      members.forEach((idx, k) => {
        const p = pts[idx];
        if (!p) return;
        const lit = selection.neurons.has(idx) || touch === idx;
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(hidden(idx) ? 0 : lit ? 1.7 : 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
        mesh.setColorAt(k, color.set(lit ? PICK_COLOR : colors[idx] ?? "#999"));
      });
      mesh.count = members.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [pts, groups, selection, touch, neurons, colors, hidden]);

  const handlers = (members: number[]) => ({
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) onHover(members[e.instanceId] ?? null);
    },
    onPointerOut: () => onHover(null),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (layer || e.delta > 4 || e.instanceId === undefined) return;
      e.stopPropagation();
      const idx = members[e.instanceId]!;
      clickNeuron(idx);
      if (modKey(e.nativeEvent)) select(new Set([idx]), new Set(), true);
    },
  });

  return (
    <>
      <instancedMesh key={`p${groups.pyr.length}`} ref={pyr} args={[geometries.pyr, undefined, Math.max(groups.pyr.length, 1)]} {...handlers(groups.pyr)}>
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh key={`i${groups.int.length}`} ref={int} args={[geometries.int, undefined, Math.max(groups.int.length, 1)]} {...handlers(groups.int)}>
        <meshStandardMaterial />
      </instancedMesh>
      {/* keyed by count: an instanced mesh's capacity is fixed when it is made */}
      <instancedMesh key={`pf${groups.pyrFaded.length}`} ref={pyrFaded} args={[geometries.pyr, undefined, Math.max(groups.pyrFaded.length, 1)]} {...handlers(groups.pyrFaded)}>
        <meshStandardMaterial transparent opacity={0.15} depthWrite={false} />
      </instancedMesh>
      <instancedMesh key={`if${groups.intFaded.length}`} ref={intFaded} args={[geometries.int, undefined, Math.max(groups.intFaded.length, 1)]} {...handlers(groups.intFaded)}>
        <meshStandardMaterial transparent opacity={0.15} depthWrite={false} />
      </instancedMesh>
    </>
  );
}

/** One shank as a thin translucent bar with a tip at its deep end; hover expands its neurons, click keeps them expanded. */

export function ProbeShank({ probe, open, onHover, onClick }: { probe: Probe; open: boolean; onHover(on: boolean): void; onClick(): void }) {
  const height = Math.max(probe.y1 - probe.y0, 0.5) + 0.6;
  const mid = (probe.y0 + probe.y1) / 2;
  const color = open ? "#3a6df0" : "#8a8f98";
  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
      onClick={(e) => {
        if (e.delta > 4) return;
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh position={[probe.x, mid, -0.05]}>
        <boxGeometry args={[probe.w, height, 0.05]} />
        <meshStandardMaterial color={color} transparent opacity={open ? 0.35 : 0.18} depthWrite={false} />
      </mesh>
      <mesh position={[probe.x, mid - height / 2 - 0.2, -0.05]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[probe.w / 2, 0.4, 4]} />
        <meshStandardMaterial color={color} transparent opacity={open ? 0.35 : 0.18} depthWrite={false} />
      </mesh>
    </group>
  );
}
