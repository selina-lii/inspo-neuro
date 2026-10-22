// 3D view: neurons as instanced shapes, pairs as fat curved arrows batched into a few line objects. Only this folder imports three.
import { GizmoHelper, GizmoViewport } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Quaternion, Vector3, type Group } from "three";
import { ensureSegLinks, moveNetwork } from "../../actions";
import { rowSegment } from "../../core/stack";
import { stackOf, tiedPairs } from "../../stackActions";
import { neighbourhood, pairHidden, visibleLinks } from "../../core/derive";
import type { MapInstance } from "../../core/store";
import { linkKey, type Point3 } from "../../core/types";
import { linkStyle } from "../../core/colors";
import { useStore } from "../useStore";
import { CadControls, type CadHandle } from "./CadControls";
import { CcgCards } from "./CcgCards";
import { NetworkCopies } from "./NetworkCopies";
import { PANEL_PX, PanelLayer, Panels3D, type SceneBox } from "./Panels3D";
import { centers } from "./tie/portAt";
import { STACK_LIFT } from "./tie/Stack";
import { PickCard } from "./tie/OverlayCards";
import { TiedStacks } from "./tie/TiedStacks";
import { probes, positions3 } from "./layout3";
import { buildBatches, Heads, LinkBatch, Neurons, ProbeShank } from "./networkParts";
import { CarrySync, claimMenu, resetClaim, SpaceMenu } from "./SpaceMenu";
import { actsOn, useBody } from "./select3";
import { useBoardDrag } from "./stats/boardDrag";
import { NetworkFrame } from "./NetworkFrame";
import { GridObject } from "./grid/GridObject";
import { PairNodeObject } from "./grid/PairNodeObject";
import { StyleNodeObject } from "./grid/StyleNodeObject";
import { MoveTriad } from "./MoveTriad";
import { BoardToolbars } from "./stats/BoardOverlay";
import { StatsBoards } from "./stats/StatsBoards";
import { lookAtBoard, ViewButtons } from "./ViewButtons";
import { selected3 } from "../../core/select";
import { secondary } from "./pointer";

/** Aim the camera at the cloud once per session and layout; afterwards panning is the viewer's own. */
function RecenterOn({ controls, center, extent, when }: { controls: React.RefObject<CadHandle | null>; center: Vector3; extent: number; when: string }) {
  const camera = useThree((t) => t.camera);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.target.copy(center);
    camera.position.set(center.x, center.y - extent * 0.2, center.z + extent * 1.25);   // far enough to see the whole cloud
    c.update();
    // only a new session or layout re-aims; hover-driven position changes must not
  }, [when, controls.current === null]);
  return null;
}

export function GalaxyView({ dark }: { dark: boolean }) {
  const s = useStore();
  const { neurons, links, filters, selection, focus, layout, embedding3, positions, zMetric, spacing, shanks } = s;
  const [hover, setHover] = useState<{ kind: "neuron"; idx: number } | { kind: "link"; key: string } | null>(null);
  const [hoverShank, setHoverShank] = useState<number | null>(null);
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  // a shank opens from its probe and stays open while the pointer is on its neurons; it closes a moment after leaving
  const closeTimer = useRef(0);
  const openShank = (id: number | null) => {
    window.clearTimeout(closeTimer.current);
    if (id !== null) setHoverShank(id);
    else closeTimer.current = window.setTimeout(() => setHoverShank(null), 300);
  };
  const expanded = useMemo(() => {
    const out = new Set(pinned);
    if (hoverShank !== null) out.add(hoverShank);
    return out;
  }, [pinned, hoverShank]);
  const expandedKey = [...expanded].sort().join();
  const tiedMain = s.ties.some((t) => t.network === "main");
  const pts = useMemo(() => positions3({ ...s, lift: tiedMain ? STACK_LIFT : 1 }, expanded), [layout, embedding3, positions, neurons, links, zMetric, spacing, shanks, expandedKey, tiedMain]);
  const probeList = useMemo(() => (layout === "physical" ? probes(neurons, shanks, spacing) : []), [layout, neurons, shanks, spacing]);
  const togglePin = (id: number) => setPinned((p) => {
    const next = new Set(p);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  // tied to a stats test, the network shows only the test's pairs
  const inTest = s.session ? tiedPairs("main", s.session) : null;
  const inTestKey = inTest ? [...inTest].join() : null;
  const passing = useMemo(() => (inTest ? links.filter((l) => inTest.has(linkKey(l.ref, l.tgt)) && !pairHidden(filters, neurons, l.ref, l.tgt)) : visibleLinks(links, filters, neurons)),
    [links, filters, neurons, inTestKey]);
  const hood = useMemo(() => neighbourhood(s, passing), [passing, s.sweep, focus]);
  const shown = useMemo(() => (hood ? passing.filter(hood.keep) : passing), [passing, hood]);
  const touch = hover?.kind === "neuron" ? hover.idx : focus?.kind === "neuron" ? focus.idx : null;
  const picked = new Set([...selection.links, ...(focus?.kind === "pair" ? [linkKey(focus.ref, focus.tgt)] : []), ...(hover?.kind === "link" ? [hover.key] : [])]);
  // a pair picked anywhere (board dot, link, grid cell) stays lit, drawn even when the filters hide it; the rest dims
  const [pickSession, pickRef, pickTgt] = (s.stats.pick.pair ?? "").split("|");
  const solo = s.stats.pick.pair && pickSession === s.session ? links.find((l) => l.ref === Number(pickRef) && l.tgt === Number(pickTgt)) ?? null : null;

  // a tied board's playback shows its row's segment on the main network too
  const mainTie = s.ties.find((t) => t.network === "main" && s.playback?.board === t.board);
  const playRow = mainTie ? stackOf(mainTie.board)?.rows[s.playback!.row] : undefined;
  const openLayer = s.session ? s.stack[s.session] : undefined;
  const playSeg = playRow && openLayer ? rowSegment(openLayer, playRow) : null;
  useEffect(() => void (playSeg && s.session && ensureSegLinks(s.session, playSeg)), [playSeg, s.session]);
  const baseMap: MapInstance = s.maps.find((m) => m.id === s.activeMap) ?? s.maps[0]!;
  const mainOff = s.mainHidden;
  const map = useMemo(() => (playSeg ? { ...baseMap, segment: playSeg } : baseMap), [baseMap, playSeg]);
  // a pick in another session dims this network whole
  const pickAway = Boolean(s.stats.pick.pair) && pickSession !== s.session;
  // a clicked pair stands out: the rest of the network drops back
  const focusKey = focus?.kind === "pair" ? linkKey(focus.ref, focus.tgt) : null;
  const drawn = useMemo(() => (solo && !shown.includes(solo) ? [...shown, solo] : shown), [shown, solo]);
  const styles = useMemo(() => new Map(drawn.map((l) => [l.i, linkStyle(s, map, l)])), [drawn, s.linkColor, s.encoding, s.segLinks, map.segment]);
  const batches = useMemo(
    () => buildBatches(drawn, styles, { solo, touch, picked, alpha: s.linkAlpha * (pickAway ? 0.15 : 1), focus: focusKey, off: (l) => (filters.onOnly || Boolean(playSeg)) && s.segLinks[map.segment]?.on[l.i] === false }),
    // picked is rebuilt each render; its contents are what matter
    [drawn, styles, solo, touch, s.linkAlpha, pickAway, [...picked].sort().join(), playSeg, s.segLinks, focusKey]);

  const hideNeuron = useMemo(() => (idx: number) => Boolean(hood && !hood.neurons.has(idx)), [hood]);
  const fadeNeuron = useMemo(() => {
    if (focus?.kind === "pair") return (idx: number) => idx !== focus.ref && idx !== focus.tgt;
    if (!inTest) return undefined;
    const ends = new Set(drawn.flatMap((l) => [l.ref, l.tgt]));
    return (idx: number) => !ends.has(idx);
  }, [drawn, inTestKey, focusKey]);
  const controls = useRef<CadHandle>(null);
  const rightDown = useRef<{ x: number; y: number } | null>(null);
  const panelHost = useRef<HTMLDivElement>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const extent = useMemo(() => {
    const span = (f: (p: Point3) => number) => Math.max(...pts.map(f)) - Math.min(...pts.map(f));
    return pts.length ? Math.max(span((p) => p.x), span((p) => p.y), 8) : 16;
  }, [pts]);
  const center = useMemo(() => {
    const c = new Vector3();
    for (const p of pts) c.add(new Vector3(p.x, p.y, p.z));
    return c.multiplyScalar(1 / Math.max(pts.length, 1));
  }, [pts]);

  const box = useMemo(() => {
    // probes reach below their neurons and their labels above
    const xs = [...pts.map((p) => p.x), ...probeList.map((p) => p.x)];
    const ys = [...pts.map((p) => p.y), ...probeList.flatMap((p) => [p.y0 - 1, p.y1 + 1.5])];
    return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z: center.z } : { x0: -8, x1: 8, y0: -8, y1: 8, z: 0 };
  }, [pts, probeList, center]);
  const hovered = hover?.kind === "neuron" ? neurons[hover.idx] : undefined;
  const hoverAt = hover?.kind === "neuron" ? pts[hover.idx] : undefined;
  const labelEls = useRef(new Map<string, HTMLDivElement>());
  const labels: Label[] = [
    // neighbouring shanks alternate label height so the labels never overlap
    ...(mainOff ? [] : probeList).map((p, i) => ({
      key: `s${p.shank.id}`, at: { x: p.x + s.mainAt[0], y: p.y1 + 0.55 + (i % 2) * 0.45 + s.mainAt[1], z: s.mainAt[2] }, className: `shank-label${expanded.has(p.shank.id) ? " on" : ""}`,
      text: `shank ${p.shank.id}${pinned.has(p.shank.id) ? " ●" : ""}`,
    })),
    ...(hovered && hoverAt ? [{ key: "tip", at: { x: hoverAt.x + s.mainAt[0], y: hoverAt.y + s.mainAt[1], z: hoverAt.z + s.mainAt[2] }, className: "tip", text: `#${hovered.id} ${hovered.type} · ${hovered.area} · ${hovered.rate.toFixed(1)} Hz` }] : []),
  ];

  return (
    <div className="map galaxy"
      onPointerDown={(e) => secondary(e) && (resetClaim(), (rightDown.current = { x: e.clientX, y: e.clientY }))}
      onPointerUp={(e) => {
        const d = rightDown.current;
        rightDown.current = null;
        if (!secondary(e) || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return setMenuAt(null);   // a right-drag pans
        const r = e.currentTarget.getBoundingClientRect();
        setMenuAt({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}>
      {/* flat: no film tone mapping, which washes out the flat colours of cards, boards and labels */}
      <Canvas flat style={{ zIndex: 2, pointerEvents: "none" }} camera={{ position: [center.x, center.y - 4, center.z + 22], fov: 45 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1.6} />
        <directionalLight position={[10, 10, 20]} intensity={0.9} />
        <CadControls ref={controls} />
        {/* with boards placed, a session switch (a picked dot from another session) keeps the camera */}
        <RecenterOn controls={controls} center={center} extent={extent} when={`${s.stats.boards.length ? "" : s.session}:${layout}:${spacing}`} />
        <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
          <GizmoViewport labels={["x", "y", "z"]} axisColors={["#e05555", "#3fbf6b", "#3a6df0"]} labelColor="#fff" />
        </GizmoHelper>
        {!mainOff && (
          <MainNetwork box={box} label={`network · ${s.session}`}>
          {probeList.map((p) => (
            <ProbeShank key={p.shank.id} probe={p} open={expanded.has(p.shank.id)}
              onHover={(on) => openShank(on ? p.shank.id : null)} onClick={() => togglePin(p.shank.id)} />
          ))}
          {batches.map((b) => (
            <LinkBatch key={b.key} batch={b} pts={pts} dark={dark} onHover={(key) => setHover(key ? { kind: "link", key } : null)} />
          ))}
          <Heads links={drawn} styles={styles} pts={pts} touch={touch} />
          <Neurons pts={pts} touch={touch} hidden={hideNeuron} faded={fadeNeuron} onHover={(idx) => {
            setHover(idx === null ? null : { kind: "neuron", idx });
            if (hoverShank !== null) openShank(idx !== null && neurons[idx]?.probe_shank === hoverShank ? hoverShank : null);
          }} />
          </MainNetwork>
        )}
        <LabelSync labels={labels} elements={labelEls} />
        {!mainOff && <group position={s.mainAt}><CcgCards links={drawn} pts={pts} dark={dark} /></group>}
        <NetworkCopies links={shown} pts={pts} center={[center.x, center.y, center.z]} extent={extent} dark={dark} />
        <CarrySync />
        <StatsBoards center={[center.x, center.y, center.z]} extent={extent} height={box.y1 - box.y0} dark={dark} onAdded={() => controls.current?.fit()} />
        <PanelLayer host={panelHost} box={box} />
        <PickCard dark={dark} />
        {s.grids.map((g) => <GridObject key={g.id} grid={g} dark={dark} />)}
        {s.pairNodes.map((n) => <PairNodeObject key={n.id} node={n} dark={dark} />)}
        {s.styleNodes.map((n) => <StyleNodeObject key={n.id} node={n} dark={dark} />)}
        <MoveTriad />
        <TiedStacks pts={pts} probes={probeList} box={box} center={[center.x, center.y, center.z]} dark={dark} />
      </Canvas>
      <div className="panel-host" ref={panelHost} />
      <Panels3D />
      <BoardToolbars onNormalTo={(board, size) => controls.current && lookAtBoard(controls.current, board, size)} />
      <ViewButtons controls={controls} />
      <div className="labels">
        {labels.map((l) => (
          <div key={l.key} ref={(el) => void (el ? labelEls.current.set(l.key, el) : labelEls.current.delete(l.key))} className={l.className}>
            {l.text}
          </div>
        ))}
      </div>
      <SpaceMenu at={menuAt} onClose={() => setMenuAt(null)} onCenter={(t, face) => {
        const c = controls.current;
        const spotOf = (u: { kind: string; id: string }) => {
          const net = s.networks.find((n) => n.id === u.id);
          const p = s.panels.find((q) => q.id === u.id);
          return u.kind === "board" || u.kind === "tie" ? centers.get(`board:${u.id}`) : u.kind === "grid" || u.kind === "node" || u.kind === "style" ? centers.get(`${u.kind}:${u.id}`)
            : u.kind === "network" ? (net ? { at: new Vector3(...net.p), size: extent * (net.s ?? 1) } : { at: center.clone().add(new Vector3(...s.mainAt)), size: extent })
            : p?.pose ? { at: new Vector3(...p.pose.p), size: Math.max(p.w, p.h) * PANEL_PX * s.objectScale * (p.pose.s ?? 1) } : undefined;
        };
        const panel = s.panels.find((q) => q.id === t.id);
        // centring frames the whole selection the item is in; facing looks at the item alone
        const spots = (face || t.kind === "node" || t.kind === "style" ? [t] : actsOn({ kind: t.kind, id: t.id })).flatMap((u) => spotOf(u) ?? []);
        const mid = spots.reduce((m, x) => m.add(x.at), new Vector3()).divideScalar(spots.length || 1);
        const spot = spots.length > 1 ? { at: mid, size: Math.max(...spots.map((x) => 2 * x.at.distanceTo(mid) + x.size)) } : spotOf(t);
        if (!c || !spot) return;
        if (!face) return c.center(spot.at, spot.size);
        // the item's stored pose is its upright: front local +z, up local +y
        const pose = t.kind === "board" || t.kind === "tie" ? s.stats.boards.find((b) => b.id === t.id)?.pose.q : t.kind === "grid" ? s.grids.find((g) => g.id === t.id)?.q : t.kind === "node" ? s.pairNodes.find((n) => n.id === t.id)?.q : t.kind === "style" ? s.styleNodes.find((n) => n.id === t.id)?.q : panel?.pose?.q;
        const q = pose ? new Quaternion(...pose) : new Quaternion();
        c.look(spot.at, new Vector3(0, 0, 1).applyQuaternion(q), new Vector3(0, 1, 0).applyQuaternion(q), spot.size);
      }} />
    </div>
  );
}

type Label = { key: string; at: Point3; className: string; text: string };

/** Labels are plain DOM over the canvas; each frame moves them to their 3D point (drei's Html makes a React root per label). */
function LabelSync({ labels, elements }: { labels: Label[]; elements: React.RefObject<Map<string, HTMLDivElement>> }) {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const l of labels) {
      const el = elements.current.get(l.key);
      if (!el) continue;
      v.set(l.at.x, l.at.y, l.at.z).project(camera);
      el.style.display = v.z > 1 ? "none" : "";
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
    }
  });
  return null;
}

/** The open session's network: its frame's bar drags it, and what is tied to it comes along. */
function MainNetwork({ box, label, children }: { box: SceneBox; label: string; children: React.ReactNode }) {
  const s = useStore();
  const group = useRef<Group>(null);
  const body = useBody("network", "main", group);
  const drag = useBoardDrag("main", group, (p) => moveNetwork("main", p), "network");
  return (
    <group ref={group} position={s.mainAt} {...body} onContextMenu={() => claimMenu({ kind: "network", id: "main" })}>
      <NetworkFrame box={[box.x0 - 0.5, box.y0, box.x1 + 0.5, box.y1]} z={box.z} label={label} picked={selected3(s, "network", "main")}
        onMenu={() => claimMenu({ kind: "network", id: "main" })} drag={drag} />
      {children}
    </group>
  );
}
