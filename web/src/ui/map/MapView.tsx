// The 2D space: React Flow holds every map's neurons, the map frames, the areas and the panels; links are drawn on a
// canvas under it, on React Flow's viewport.
import {
  applyNodeChanges,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeChange,
  type Viewport as FlowViewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addArea, areaMembers, clickNeuron, dropNeuron, focusPair, moveMap, moveNeurons, select, setActiveMap, updateArea, updatePanel } from "../../actions";
import { linkStyle, neuronColors } from "../../core/colors";
import { linksAmong, neighbourhood, visibleLinks } from "../../core/derive";
import { store, type MapInstance } from "../../core/store";
import { linkKey, type Area, type Point } from "../../core/types";
import { useStore } from "../useStore";
import { AreaNode, type AreaData } from "./AreaNode";
import { distanceToLink, drawLink, toScreen, type Viewport } from "./draw";
import { MapFrameNode, type MapFrameData } from "./MapFrameNode";
import { CARD, DOT, NeuronNode, type NeuronData } from "./NeuronNode";
import { SpacePanelNode, type SpacePanelData } from "./SpacePanelNode";

const CARD_ZOOM = 1.0;
const FRAME_PAD = 60;
const nodeTypes = { neuron: NeuronNode, area: AreaNode, mapframe: MapFrameNode, panel: SpacePanelNode };

export function MapView({ dark }: { dark: boolean }) {
  return (
    <ReactFlowProvider>
      <FlowMap dark={dark} />
    </ReactFlowProvider>
  );
}

const neuronNodeId = (map: number, idx: number) => `n${map}_${idx}`;
const parseNeuron = (id: string): [number, number] => id.slice(1).split("_").map(Number) as [number, number];

/** A map's neurons offset into the space. */
const placed = (positions: Point[], m: MapInstance): Point[] => positions.map((p) => ({ x: p.x + m.dx, y: p.y + m.dy }));

function FlowMap({ dark }: { dark: boolean }) {
  const s = useStore();
  const { neurons, positions, links, filters, selection, focus, areas, maps, activeMap, panels, segLinks } = s;
  const flow = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  // the viewport lives in a ref: a pan redraws the canvas directly and renders no React node
  const viewRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const settleTimer = useRef(0);
  const frame = useRef(0);
  const hoverRef = useRef<string | null>(null);   // '<map>|<ref>-<tgt>' under the pointer, drawn without a render
  // zoom as of the last settled move: card sizes and placement follow it, so a pan re-renders no node
  const [settledZoom, setSettledZoom] = useState(1);
  const [hoverNeuron, setHoverNeuron] = useState<number | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const areaDrag = useRef<{ id: string; start: Point; members: Map<number, Point> } | null>(null);

  const passing = useMemo(() => visibleLinks(links, filters, neurons), [links, filters, neurons]);
  const hood = useMemo(() => neighbourhood(s, passing), [passing, s.sweep, focus]);
  const shown = useMemo(() => (hood ? passing.filter(hood.keep) : passing), [passing, hood]);
  const k = 1;   // world units per pixel at zoom 1: cards, dots and panels scale with the zoom, as the map does
  const focusKey = focus?.kind === "pair" ? linkKey(focus.ref, focus.tgt) : null;
  const focusNeuronIdx = focus?.kind === "neuron" ? focus.idx : null;   // a number, so focusing a pair rebuilds no node
  const touchNeuron = hoverNeuron ?? focusNeuronIdx;
  const colors = useMemo(() => neuronColors(s).colors, [neurons, s.neuronValues, s.neuronColor]);
  const bbox = useMemo(() => {
    if (!positions.length) return { x0: 0, y0: 0, x1: 1, y1: 1 };
    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }, [positions]);

  // per map, the links it draws and how: on-only filtering follows each map's own segment
  const drawn = useMemo(
    () =>
      maps.map((m) => {
        const styled = shown
          .map((l) => ({ link: l, style: linkStyle(s, m, l) }))
          .filter(({ link }) => !filters.onOnly || segLinks[m.segment]?.on[link.i] !== false);
        styled.sort((a, b) => a.style.width - b.style.width);
        return { map: m, styled };
      }),
    [maps, shown, s.linkColor, s.encoding, segLinks, filters.onOnly],
  );

  // cards only where they fit at this zoom: focused, selected and well-connected neurons claim space first
  const cardSet = useMemo(() => {
    const out = new Set<number>();
    if (settledZoom < CARD_ZOOM) return out;
    const degree = new Array<number>(neurons.length).fill(0);
    for (const l of shown) degree[l.ref]! += 1, degree[l.tgt]! += 1;
    const rank = (i: number) => (focusNeuronIdx === i ? 1e9 : 0) + (selection.neurons.has(i) ? 1e6 : 0) + degree[i]!;
    const boxes: Point[] = [];
    for (const i of neurons.map((_, i) => i).sort((a, b) => rank(b) - rank(a))) {
      const p = positions[i];
      if (!p || boxes.some((q) => Math.abs(q.x - p.x) < CARD.w * k && Math.abs(q.y - p.y) < CARD.h * k)) continue;
      boxes.push(p);
      out.add(i);
    }
    return out;
  }, [settledZoom, neurons, shown, positions, selection, focusNeuronIdx, k]);

  // nodes are rebuilt from the store; React Flow's own measurements are kept so nothing re-measures
  useEffect(() => {
    setNodes((prev) => {
      const measured = new Map(prev.map((n) => [n.id, n.measured]));
      const out: Node[] = [];
      // a panel nobody has moved sits beside the maps: details right of the last one, the time slider below them
      const right = Math.max(...maps.map((m) => bbox.x1 + m.dx)) + FRAME_PAD * 2;
      const bottom = Math.max(...maps.map((m) => bbox.y1 + m.dy)) + FRAME_PAD * 2;
      const autoAt = (p: (typeof panels)[number]) =>
        p.kind === "ccg" ? { x: right, y: bbox.y0 - FRAME_PAD }
          : p.kind === "details" ? { x: right + (panels.find((q) => q.kind === "ccg")?.w ?? 0) * k + FRAME_PAD, y: bbox.y0 - FRAME_PAD }
          : p.kind === "pairs" ? { x: bbox.x0 - FRAME_PAD * 2 - p.w * k, y: bbox.y0 - FRAME_PAD }
          : p.kind === "stats" ? { x: bbox.x0 - FRAME_PAD, y: bbox.y0 - FRAME_PAD * 3 - 40 * k }
          : p.kind === "metadata" ? { x: bbox.x0 - FRAME_PAD * 2 - p.w * k, y: bbox.y0 - FRAME_PAD * 3 - 40 * k }
          : p.kind === "legend" ? { x: bbox.x0 - FRAME_PAD, y: bottom + ((panels.find((q) => q.kind === "timeline")?.h ?? 0) + 16) * k }
            : { x: bbox.x0 - FRAME_PAD, y: bottom };
      for (const p of panels.filter((q) => !q.closed)) {
        out.push({
          id: `p${p.id}`, type: "panel", position: p.auto ? autoAt(p) : { x: p.x, y: p.y }, width: p.w * k, height: (p.collapsed ? 32 : p.h) * k, dragHandle: ".space-panel-head",
          zIndex: 10, data: { panel: p, k } satisfies SpacePanelData, measured: measured.get(`p${p.id}`),
        });
      }
      maps.forEach((m, mi) => {
        out.push({
          id: `f${m.id}`, type: "mapframe", dragHandle: ".map-frame-head",
          position: { x: bbox.x0 + m.dx - FRAME_PAD, y: bbox.y0 + m.dy - FRAME_PAD },
          width: bbox.x1 - bbox.x0 + 2 * FRAME_PAD, height: bbox.y1 - bbox.y0 + 2 * FRAME_PAD, zIndex: -2,
          data: { map: m, k, active: m.id === activeMap, count: maps.length, stack: maps.slice(0, mi).filter((o) => o.dx === m.dx && o.dy === m.dy).length } satisfies MapFrameData, measured: measured.get(`f${m.id}`),
        });
        for (const [i, n] of neurons.entries()) {
          if (hood && !hood.neurons.has(i)) continue;
          const card = cardSet.has(i);
          const w = (card ? CARD.w : DOT) * k;
          const h = (card ? CARD.h : DOT) * k;
          const p = positions[i] ?? { x: 0, y: 0 };
          const id = neuronNodeId(mi, i);
          out.push({
            id, type: "neuron", position: { x: p.x + m.dx - w / 2, y: p.y + m.dy - h / 2 }, width: w, height: h,
            selected: selection.neurons.has(i),
            data: { neuron: n, card, k, lit: touchNeuron === i, color: colors[i] ?? "#999" } satisfies NeuronData,
            measured: measured.get(id),
          });
        }
      });
      for (const a of areas) {
        out.push({
          id: `a${a.id}`, type: "area", position: { x: a.x - a.w / 2, y: a.y - a.h / 2 }, width: a.w, height: a.h, zIndex: -1,
          data: { area: a, k, count: areaMembers(a).size } satisfies AreaData, measured: measured.get(`a${a.id}`),
        });
      }
      return out;
    });
  }, [neurons, positions, areas, cardSet, selection, touchNeuron, k, maps, activeMap, panels, bbox, colors]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // a new session fits its first map into view once its nodes exist
  const fitKey = `${s.session}:${neurons.length}`;
  useEffect(() => {
    if (!neurons.length) return;
    const timer = window.setTimeout(() => flow.fitView({ padding: 0.04, duration: 0, nodes: [{ id: `f${maps[0]!.id}` }, { id: "pccg" }, { id: "pdetails" }, { id: "ppairs" }] }), 60);
    return () => window.clearTimeout(timer);
  }, [fitKey, flow, neurons.length]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== size.w * dpr || canvas.height !== size.h * dpr) [canvas.width, canvas.height] = [size.w * dpr, size.h * dpr];
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const v = viewRef.current;
    const radius = (DOT / 2) * k * v.scale;
    for (const { map, styled } of drawn) {
      const screen = placed(positions, map).map((p) => toScreen(p, v));
      for (const { link, style } of styled) {
        const a = screen[link.ref];
        const b = screen[link.tgt];
        if (!a || !b) continue;
        const key = linkKey(link.ref, link.tgt);
        const lit = touchNeuron === null || link.ref === touchNeuron || link.tgt === touchNeuron;
        const picked = selection.links.has(key) || key === focusKey || `${map.id}|${key}` === hoverRef.current;
        drawLink(ctx, link, a, b, v.scale, { ...style, alpha: lit ? style.alpha : 0.06 }, picked, radius);
      }
    }
  }, [drawn, positions, size, selection, focusKey, touchNeuron, k]);

  useEffect(draw, [draw, dark]);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** The link under a screen point, as '<map>|<ref>-<tgt>'. */
  const linkAt = useCallback(
    (p: Point): string | null => {
      let best: string | null = null;
      let bestD = 7;
      for (const { map, styled } of drawn) {
        const screen = placed(positions, map).map((q) => toScreen(q, viewRef.current));
        for (let i = styled.length - 1; i >= 0; i--) {
          const l = styled[i]!.link;
          const a = screen[l.ref];
          const b = screen[l.tgt];
          if (!a || !b) continue;
          const d = distanceToLink(p, a, b);
          if (d < bestD) [best, bestD] = [`${map.id}|${linkKey(l.ref, l.tgt)}`, d];
        }
      }
      return best;
    },
    [drawn, positions],
  );

  const areaOf = (id: string): Area | undefined => store.get().areas.find((a) => `a${a.id}` === id);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // selection has one owner, the store: React Flow's select changes only update it
      const picks = changes.filter((c) => c.type === "select" && c.id.startsWith("n"));
      if (picks.length) {
        const chosen = new Set(store.get().selection.neurons);
        for (const c of picks) {
          if (c.type !== "select") continue;
          if (c.selected) chosen.add(parseNeuron(c.id)[1]);
          else chosen.delete(parseNeuron(c.id)[1]);
        }
        const among = new Set(linksAmong(visibleLinks(store.get().links, store.get().filters, store.get().neurons), chosen).map((l) => linkKey(l.ref, l.tgt)));
        select(chosen, chosen.size ? among : store.get().selection.links, false);
      }
      const rest = changes.filter((c) => !(c.type === "select" && c.id.startsWith("n")));
      if (!rest.length) return;
      setNodes((prev) => {
        const next = applyNodeChanges(rest, prev);
        const moves = new Map<number, Point>();
        for (const c of rest) {
          if (c.type !== "position" && c.type !== "dimensions") continue;
          const node = next.find((n) => n.id === c.id);
          if (!node) continue;
          const w = node.width ?? 0;
          const h = node.height ?? 0;
          const center = { x: node.position.x + w / 2, y: node.position.y + h / 2 };
          if (node.type === "neuron" && c.type === "position" && c.dragging) {
            const [mi, idx] = parseNeuron(node.id);
            const m = store.get().maps[mi]!;
            moves.set(idx, { x: center.x - m.dx, y: center.y - m.dy });
          }
          if (node.type === "mapframe" && c.type === "position" && c.dragging) {
            const id = node.id.slice(1);
            const [dx, dy] = [node.position.x + FRAME_PAD - bbox.x0, node.position.y + FRAME_PAD - bbox.y0];
            // dropped near another map: lay exactly over it, so the two segments compare neuron for neuron
            const snap = (bbox.x1 - bbox.x0) * 0.1;
            const under = store.get().maps.find((m) => m.id !== id && Math.hypot(m.dx - dx, m.dy - dy) < snap);
            moveMap(id, under?.dx ?? dx, under?.dy ?? dy);
          }
          if (node.type === "panel" && (c.type === "dimensions" ? c.resizing : c.dragging)) {
            const panel = (node.data as SpacePanelData).panel;
            updatePanel(panel.id, c.type === "dimensions" ? { w: w / k, h: h / k, x: node.position.x, y: node.position.y } : { x: node.position.x, y: node.position.y });
          }
          if (node.type === "area" && (c.type === "dimensions" ? c.resizing : c.dragging)) {
            const area = areaOf(node.id)!;
            updateArea(area.id, { x: center.x, y: center.y, w, h });
            const drag = areaDrag.current;
            if (c.type === "position" && drag?.id === area.id) {
              for (const [i, p] of drag.members) moves.set(i, { x: p.x + center.x - drag.start.x, y: p.y + center.y - drag.start.y });
            }
          }
        }
        if (moves.size) moveNeurons(moves);
        return next;
      });
    },
    [bbox, k],
  );

  const onNodeDragStart = (_: unknown, node: Node) => {
    const area = node.type === "area" ? areaOf(node.id) : undefined;
    if (!area) return;
    const members = new Map([...areaMembers(area)].map((i) => [i, store.get().positions[i]!]));
    areaDrag.current = { id: area.id, start: { x: area.x, y: area.y }, members };
  };

  const onNodeDragStop = (_: unknown, node: Node, dragged: Node[]) => {
    areaDrag.current = null;
    const moved = dragged.length ? dragged : [node];
    for (const n of moved) if (n.type === "neuron") dropNeuron(parseNeuron(n.id)[1]);
  };

  const onNodeClick = (_: unknown, node: Node) => {
    if (node.type !== "neuron") return;
    const [mi, idx] = parseNeuron(node.id);
    setActiveMap(store.get().maps[mi]!.id);
    clickNeuron(idx);
  };

  const onPaneClick = (e: React.MouseEvent) => {
    const hit = linkAt(local(e));
    const add = e.metaKey || e.ctrlKey;
    if (hit) {
      const [mapId, key] = hit.split("|") as [string, string];
      const [ref, tgt] = key.split("-").map(Number) as [number, number];
      if (mapId !== store.get().activeMap) setActiveMap(mapId);
      focusPair(ref, tgt);
      if (add) select(new Set(), new Set([key]), true);
    } else if (!add) {
      store.set({ focus: null, selection: { neurons: new Set(), links: new Set() } });
    }
  };

  const onPaneMouseMove = (e: React.MouseEvent) => {
    if (e.buttons) return;
    const over = linkAt(local(e));
    if (over === hoverRef.current) return;
    hoverRef.current = over;
    wrapRef.current!.style.cursor = over ? "pointer" : "";
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  };

  const onMove = useCallback(
    (_: unknown, v: FlowViewport) => {
      viewRef.current = { x: v.x, y: v.y, scale: v.zoom };
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(draw);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => setSettledZoom(Math.round(v.zoom * 8) / 8), 180);
    },
    [draw],
  );

  const [areaName, setAreaName] = useState<string | null>(null);   // the name being typed for a new area
  const newArea = (name: string) => {
    setAreaName(null);
    if (!name.trim()) return;
    const r = wrapRef.current!.getBoundingClientRect();
    const center = flow.screenToFlowPosition({ x: r.left + size.w / 2, y: r.top + size.h / 2 });
    addArea(name.trim(), center, { w: 320 / viewRef.current.scale, h: 220 / viewRef.current.scale });
  };

  return (
    <div ref={wrapRef} className="map">
      <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} />
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={(_, node) => node.type === "neuron" && setHoverNeuron(parseNeuron(node.id)[1])}
        onNodeMouseLeave={() => setHoverNeuron(null)}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onPaneMouseMove={onPaneMouseMove}
        onMove={onMove}
        minZoom={0.03}
        maxZoom={12}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={["Meta", "Control"]}
        deleteKeyCode={null}
        colorMode={dark ? "dark" : "light"}
      >
        {s.overview && <MiniMap pannable zoomable style={{ width: 160, height: 110 }} ariaLabel="overview of the whole space: drag the box to move the view" nodeColor={(n) => (n.type === "neuron" ? (n.data as NeuronData).color : n.type === "panel" ? "rgba(58,109,240,0.5)" : "rgba(58,109,240,0.15)")} />}
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="map-tools">
        {areaName === null ? (
          <button onClick={() => setAreaName("")} title="a named box: neurons dropped in get its name as a tag; its header tags what it holds">
            + area
          </button>
        ) : (
          <form className="row" onSubmit={(e) => (e.preventDefault(), newArea(areaName))}>
            <input autoFocus placeholder="area name = tag it applies" value={areaName} onChange={(e) => setAreaName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setAreaName(null)} />
            <button type="submit">add</button>
            <button type="button" onClick={() => setAreaName(null)}>cancel</button>
          </form>
        )}
      </div>
    </div>
  );
}
