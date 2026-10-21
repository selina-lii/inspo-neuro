// User actions: each reads the store, calls the API, and writes the result back.
import { axesLayout, inArea, lerpPoints, linksAmong, normalize, physicalLayout, visibleLinks } from "./core/derive";
import { orderedPairs, stepPair } from "./core/pairs";
import type { Pose, Vec3 } from "./core/stats";
import { activeSegment, DEFAULT_PANELS, PANEL_PX, panelCcg, store, type CcgOptions, type MapInstance, type NetworkCopy, type SpacePanel } from "./core/store";
import { linkKey, type Area, type LayoutKind, type Link, type Neuron, type Point } from "./core/types";
import { api, toPoints, type FitProgress } from "./io/api";
import { loadTraces, tracesKey } from "./io/traces";
import { dropConfig, dropSource } from "./gridActions";
import { mainAtOf, mainHiddenOf, networksOf, newWorkspace, openWorkspace } from "./workspaceActions";
import { record, undo } from "./history";

let animation = 0;
let fitTimer = 0;

export function fail(error: unknown): void {
  store.set({ busy: null, error: error instanceof Error ? error.message : String(error) });
}

type Place = { project: string; workspace: string; session: string; layout: LayoutKind; view: "2d" | "3d"; focus: ReturnType<typeof store.get>["focus"] };

function savedPlace(): Place | null {
  try {
    return JSON.parse(window.localStorage.getItem("neuromap:place") ?? "null");
  } catch {
    return null;
  }
}

// where the viewer is, so a reload (or a code change in dev) comes back to it
store.subscribe(() => {
  const { project, workspace, session, layout, view, focus } = store.get();
  if (!project || !workspace || !session) return;
  try {
    window.localStorage.setItem("neuromap:place", JSON.stringify({ project, workspace, session, layout, view, focus }));
  } catch {
    // storage blocked: reloads start at the first session
  }
});

/** A project already open on the server comes back as it was; otherwise the picker asks for one. */
export async function boot(): Promise<void> {
  try {
    const ccg = JSON.parse(window.localStorage.getItem("neuromap:ccg") ?? "null");
    if (ccg) store.set({ ccg: { ...store.get().ccg, ...ccg } });
  } catch {
    // unreadable: default plot options
  }
  try {
    const { projects, open } = await api.projects();
    store.set({ projects });
    if (open) await afterOpen(savedPlace(), false);
  } catch (error) {
    fail(error);
  }
}

export async function openProject(name: string): Promise<void> {
  const { unsaved, project } = store.get();
  if (unsaved && !window.confirm(`${unsaved} unsaved edit(s) in ${project}. Discard them and open ${name}?`)) return;
  window.clearTimeout(fitTimer);
  store.set({ busy: `Opening ${name}…`, error: null, session: null, fitProgress: null });
  try {
    await api.open(name, unsaved > 0);
    store.set({ unsaved: 0 });
    await afterOpen(null, true);
  } catch (error) {
    fail(error);
  }
}

// a picked project starts on an empty workspace; a reload reopens the one it was on
async function afterOpen(place: Place | null, fresh: boolean): Promise<void> {
  const [info, { names }] = await Promise.all([api.sessions(), api.workspaces()]);
  countUnsaved();
  store.set({ workspaces: names, project: info.name, sessions: info.sessions, pairGroups: info.pair_groups, neuronGroups: info.neuron_groups, groupMeta: info.group_meta, busy: null });
  if (!info.sessions[0]) return store.set({ neurons: [], links: [], positions: [], areas: [], error: `${info.name} has no sessions with stored CCGs.` });
  const back = place?.project === info.name && names.includes(place.workspace) ? place : null;
  if (fresh || !names.length) await newWorkspace();
  else await openWorkspace(back?.workspace ?? names[0]!);
  if (back && back.session === store.get().session) {
    store.set({ view: back.view, focus: back.focus });
    if (back.layout !== "physical") await setLayout(back.layout);
    if (back.view === "3d") await setView("3d");
  }
}

export async function openSession(session: string): Promise<void> {
  store.set({
    busy: `Loading ${session}…`, error: null, session, focus: null, embedding3: null, traces: null, segLinks: {}, neuronValues: null, themes: {}, extendUnits: [],
    maps: [{ id: "m0", segment: "all", dx: 0, dy: 0 }], activeMap: "m0", selection: { neurons: new Set(), links: new Set() }, networks: networksOf(session), mainHidden: mainHiddenOf(session), mainAt: mainAtOf(session),
  });
  try {
    const [{ neurons, links, shanks }, { areas }, { segments, bounds }] = await Promise.all([api.session(session), api.areas(session), api.segments(session)]);
    store.set({ neurons, links: indexed(links), shanks, areas, segments, bounds, positions: physicalLayout(neurons, shanks, store.get().spacing), layout: "physical", busy: null });
    showSegment(session, "all");
    for (const n of store.get().networks) ensureSegLinks(session, n.segment);
    api.neuronValues(session).then((v) => store.get().session === session && store.set({ neuronValues: v }), fail);
    api.themes(session).then((t) => store.get().session === session && store.set({ themes: t }), fail);
    api.extends(session).then((e) => store.get().session === session && store.set({ extendUnits: e.units }), fail);
    pollFits(await api.startFits(session));
  } catch (error) {
    fail(error);
  }
}

/** Links carry their position in the session list: per-segment arrays are in that order. */
const indexed = (links: Link[]): Link[] => links.map((l, i) => ({ ...l, i }));

/** Load a segment's link values and CCG traces; the store says when each is ready. */
export function showSegment(session: string, segment: string): void {
  ensureSegLinks(session, segment);
  loadTraces(session, segment).then(() => {
    const s = store.get();
    if (s.session === session && activeSegment(s) === segment) store.set({ traces: tracesKey(session, segment) });
  }, fail);
}

const segLinksPending = new Set<string>();

export function ensureSegLinks(session: string, segment: string): void {
  const norms = store.get().ccg.norms;
  const ask = `${session}:${segment}:${norms.join()}`;
  if (store.get().segLinks[segment]?.norms === norms.join() || segLinksPending.has(ask)) return;
  segLinksPending.add(ask);
  api.segmentLinks(session, segment, norms).then((v) => {
    // an answer for norms since changed is dropped: the CS it carries is on the old scale
    if (store.get().session === session && store.get().ccg.norms.join() === norms.join()) store.set({ segLinks: { ...store.get().segLinks, [segment]: { ...v, norms: norms.join() } } });
  }, fail).finally(() => segLinksPending.delete(ask));
}

/** The CCG panel's options; new normalisations re-measure every segment's CS, the old one drawn until the new arrives. */
export function setCcgOptions(patch: Partial<CcgOptions>): void {
  const s = store.get();
  const ccg = { ...s.ccg, ...patch };
  const renorm = ccg.norms.join() !== s.ccg.norms.join();
  store.set({ ccg });
  try {
    window.localStorage.setItem("neuromap:ccg", JSON.stringify(ccg));
  } catch {
    // storage blocked: options reset on reload
  }
  if (renorm && s.session) for (const m of s.maps) ensureSegLinks(s.session, m.segment);
}

/** A map shows *segment*; the active map's segment also drives the CCG plot. */
export function setMapSegment(mapId: string, segment: string): void {
  const s = store.get();
  store.set({ maps: s.maps.map((m) => (m.id === mapId ? { ...m, segment } : m)), activeMap: mapId, traces: null });
  if (s.session) showSegment(s.session, segment);
}

export function setActiveMap(mapId: string): void {
  const s = store.get();
  const segment = s.maps.find((m) => m.id === mapId)?.segment ?? "all";
  store.set({ activeMap: mapId, traces: null });
  if (s.session) showSegment(s.session, segment);
}

/** Another map of the same neurons, to the right of the others, for another segment. */
export function addMap(segment: string, width: number): void {
  const s = store.get();
  const right = Math.max(...s.maps.map((m) => m.dx));
  const map: MapInstance = { id: `m${Date.now().toString(36)}`, segment, dx: right + width * 1.15, dy: 0 };
  store.set({ maps: [...s.maps, map] });
  setActiveMap(map.id);
}

export function removeMap(mapId: string): void {
  const s = store.get();
  const maps = s.maps.filter((m) => m.id !== mapId);
  if (!maps.length) return;
  store.set({ maps });
  if (s.activeMap === mapId) setActiveMap(maps[0]!.id);
}

export function moveMap(mapId: string, dx: number, dy: number): void {
  store.set({ maps: store.get().maps.map((m) => (m.id === mapId ? { ...m, dx, dy } : m)) });
}

export function setLinkColor(patch: Partial<ReturnType<typeof store.get>["linkColor"]>): void {
  const s = store.get();
  const linkColor = { ...s.linkColor, ...patch };
  store.set({ linkColor });
  if (s.session && linkColor.kind !== "type" && linkColor.kind !== "strength") {
    ensureSegLinks(s.session, linkColor.a);
    ensureSegLinks(s.session, linkColor.b);
  }
}

/** A workspace's panels: the default ones as it left them, then its added CCG panels. */
export const panelsFrom = (saved: SpacePanel[] | undefined): SpacePanel[] =>
  saved?.length ? [...DEFAULT_PANELS.map((d) => saved.find((p) => p.id === d.id) ?? d), ...saved.filter((p) => p.ccg && !DEFAULT_PANELS.some((d) => d.id === p.id))] : DEFAULT_PANELS;

/** Show a panel, expanded: where it last was in 2D, in front of the camera in 3D. */
export const openPanel = (id: string): void => patchPanel(id, { collapsed: false, closed: false, summon: store.get().view === "3d" });

/** Show a panel at a place in 3D, as a CCG card's double-click does. */
export const openPanelAt = (id: string, pose: Pose): void => patchPanel(id, { collapsed: false, closed: false, pose });

/** A panel the viewer moved or resized in 2D stops following the maps. */
export const updatePanel = (id: string, patch: Partial<SpacePanel>): void => patchPanel(id, { auto: false, ...patch });

export function setPanelCcg(id: string, patch: Partial<CcgOptions>): void {
  if (id === "ccg") return setCcgOptions(patch);
  patchPanel(id, { ccg: { ...panelCcg(store.get(), id), ...patch } });
}

/** Another CCG panel, starting as a copy of *from*'s options: beside it when it is out, else in front of the camera. */
export function addCcgPanel(from = "ccg"): void {
  const s = store.get();
  const src = s.panels.find((p) => p.id === from)!;
  const id = `ccg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  // to its right, along its own x, a panel's width and a gap over
  const step = (src.w * PANEL_PX * s.objectScale * (src.pose?.s ?? 1)) * 1.1;
  const [x, y, z, w] = src.pose?.q ?? [0, 0, 0, 1];
  const right: Vec3 = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
  const pose = src.pose && !src.closed ? { ...src.pose, p: src.pose.p.map((v, i) => v + right[i]! * step) as Vec3 } : undefined;
  const panel: SpacePanel = { ...src, id, closed: false, collapsed: false, ccg: panelCcg(s, from), pose, summon: !pose && s.view === "3d" };
  store.set({ panels: [...s.panels, panel] });
}

/** Close a panel: an added CCG panel goes, and the grids it configured fall back to the defaults. */
export function closePanel(id: string): void {
  if (DEFAULT_PANELS.some((d) => d.id === id)) return patchPanel(id, { closed: true });
  store.set({ panels: store.get().panels.filter((p) => p.id !== id) });
  dropConfig(id);
}

export function patchPanel(id: string, patch: Partial<SpacePanel>): void {
  store.set({ panels: store.get().panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
}

export function resetPanels(): void {
  store.set({ panels: DEFAULT_PANELS });
}

function mergeFits(progress: FitProgress): void {
  const byKey = new Map(progress.fits.map((f) => [linkKey(f.ref, f.tgt), f]));
  const links = store.get().links.map((l) => ({ ...l, fit: byKey.get(linkKey(l.ref, l.tgt)) ?? l.fit }));
  store.set({ links, fitProgress: { done: progress.done, total: progress.total, running: progress.running } });
}

function pollFits(progress: FitProgress): void {
  window.clearTimeout(fitTimer);
  mergeFits(progress);
  const session = store.get().session;
  if (!progress.running || !session) return;
  fitTimer = window.setTimeout(async () => {
    if (store.get().session === session) pollFits(await api.fits(session, store.get().fitProgress?.done ?? 0));
  }, 4000);
}

export function animateTo(target: Point[]): void {
  const from = store.get().positions;
  const start = performance.now();
  const id = ++animation;
  const step = (now: number) => {
    if (id !== animation) return;
    const t = Math.min((now - start) / 450, 1);
    store.set({ positions: lerpPoints(from, target, t) });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export async function setLayout(kind: LayoutKind, axes = store.get().axes): Promise<void> {
  const { session, neurons, links, shanks, spacing } = store.get();
  if (!session) return;
  store.set({ layout: kind, axes });
  if (kind === "embedding" && store.get().view === "3d" && !store.get().embedding3) loadEmbedding3(session);
  if (kind === "physical") return animateTo(physicalLayout(neurons, shanks, spacing));
  if (kind === "axes") return animateTo(axesLayout(neurons, links, axes.x, axes.y, spacing));
  store.set({ busy: kind === "embedding" ? "Computing embedding…" : null });
  try {
    const { xy } = await api.layout(session, kind);
    store.set({ busy: null });
    if (kind === "embedding" && xy) animateTo(normalize(toPoints(xy), 1300));
    if (kind === "manual" && xy && xy.length === neurons.length) animateTo(toPoints(xy));
  } catch (error) {
    fail(error);
  }
}

let manualTimer = 0;

/** Move neurons by hand: the layout becomes manual, saved once the moves settle. */
export function moveNeurons(moves: Map<number, Point>): void {
  const positions = store.get().positions.map((p, i) => moves.get(i) ?? p);
  store.set({ positions, layout: "manual" });
  window.clearTimeout(manualTimer);
  manualTimer = window.setTimeout(() => {
    const { session, positions: now } = store.get();
    if (session) api.saveManual(session, now.map((p) => [p.x, p.y])).catch(fail);
  }, 800);
}

export async function setView(view: "2d" | "3d"): Promise<void> {
  store.set({ view });
  const { session, layout, embedding3 } = store.get();
  if (view === "3d" && layout === "embedding" && !embedding3 && session) await loadEmbedding3(session);
}

async function loadEmbedding3(session: string): Promise<void> {
  store.set({ busy: "Computing 3D embedding…" });
  try {
    const { xy } = await api.embedding3(session);
    if (store.get().session === session) store.set({ embedding3: xy.map(([x, y, z]) => ({ x, y, z })), busy: null });
  } catch (error) {
    fail(error);
  }
}

/** Fan neurons further apart (or closer) in the layouts that place them by rule. */
export function setSpacing(spacing: number): void {
  store.set({ spacing });
  const { layout } = store.get();
  if (layout === "physical" || layout === "axes") setLayout(layout);
}

export function focusPair(ref: number, tgt: number): void {
  store.set({ focus: { kind: "pair", ref, tgt } });
}

/** A click on a neuron: it takes the focus; in minesweeper mode it also opens (or closes again) its neighbourhood. */
export function clickNeuron(idx: number): void {
  const { sweep } = store.get();
  if (sweep.on) {
    const open = new Set(sweep.open);
    if (!open.delete(idx)) open.add(idx);
    store.set({ sweep: { ...sweep, open } });
  }
  focusNeuron(idx);
}

export function focusNeuron(idx: number): void {
  store.set({ focus: { kind: "neuron", idx } });
}

export function select(neurons: Set<number>, links: Set<string>, add: boolean): void {
  const current = store.get().selection;
  store.set({
    selection: add
      ? { neurons: new Set([...current.neurons, ...neurons]), links: new Set([...current.links, ...links]) }
      : { neurons, links },
  });
}

export function clearSelection(): void {
  store.set({ selection: { neurons: new Set(), links: new Set() } });
}

let areaTimer = 0;

function setAreas(areas: Area[]): void {
  store.set({ areas });
  window.clearTimeout(areaTimer);
  areaTimer = window.setTimeout(() => {
    const { session, areas: now } = store.get();
    if (session) api.saveAreas(session, now).catch(fail);
  }, 600);
}

export function addArea(name: string, center: Point, size: { w: number; h: number }): void {
  const area: Area = { id: Math.random().toString(36).slice(2, 10), name, x: center.x, y: center.y, ...size };
  setAreas([...store.get().areas, area]);
}

export function updateArea(id: string, patch: Partial<Area>): void {
  setAreas(store.get().areas.map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

export function removeArea(id: string): void {
  setAreas(store.get().areas.filter((a) => a.id !== id));
}

export function areaMembers(area: Area): Set<number> {
  const out = new Set<number>();
  store.get().positions.forEach((p, i) => inArea(p, area) && out.add(i));
  return out;
}

/** Tag what an area holds: its neurons, or the shown pairs with both ends inside it. */
export function tagArea(area: Area, kind: "pair" | "neuron", shown: Link[]): Promise<void> {
  const inside = areaMembers(area);
  return tagMembers(kind, area.name, "add", kind === "neuron" ? inside : new Set(), new Set(linksAmong(shown, inside).map((l) => linkKey(l.ref, l.tgt))));
}

/** A neuron dropped into areas joins their tags. */
export function dropNeuron(idx: number): Promise<void> {
  const p = store.get().positions[idx];
  const hits = store.get().areas.filter((a) => p && inArea(p, a));
  return hits.reduce((done, a) => done.then(() => tagMembers("neuron", a.name, "add", new Set([idx]), new Set())), Promise.resolve());
}

/** Edits stay on the server, unwritten, until this runs (the save button or ⌘S). */
export async function saveEdits(): Promise<void> {
  store.set({ busy: "Saving…" });
  try {
    store.set({ ...(await api.save()), busy: null, toast: { text: "Saved." } });
    const { session } = store.get();
    if (!session) return;
    const { links } = await api.session(session);
    const fits = new Map(store.get().links.map((l) => [linkKey(l.ref, l.tgt), l.fit]));
    store.set({ links: indexed(links).map((l) => ({ ...l, fit: fits.get(linkKey(l.ref, l.tgt)) ?? l.fit })) });
  } catch (error) {
    fail(error);
  }
}

export const countUnsaved = () => api.unsaved().then(({ unsaved }) => store.set({ unsaved }), fail);

/** Pairs by session: a grid's cells span sessions, the open session's own lists do not. */
export type SessionPairs = Map<string, [number, number][]>;
type PairState = "sel" | "unsel" | "del";

// server edits run one after another: an undo pressed mid-save waits for the save it undoes
let edits = Promise.resolve(true);
const queued = (write: () => Promise<boolean>) => (edits = edits.then(write));

const linksOf = (session: string): Link[] => (session === store.get().session ? store.get().links : store.get().stack[session]?.links ?? []);

/** A session's links (and neurons) as the server now has them: the open session's lists, its stack layer, or both. */
function takeSession(session: string, links: Link[], neurons?: Neuron[]): void {
  const s = store.get();
  const fits = new Map(linksOf(session).map((l) => [linkKey(l.ref, l.tgt), l.fit]));
  const merged: Link[] = indexed(links).map((l) => ({ ...l, fit: fits.get(linkKey(l.ref, l.tgt)) ?? l.fit }));
  const layer = s.stack[session];
  store.set({
    ...(session === s.session ? { links: merged, ...(neurons ? { neurons } : {}) } : {}),
    ...(layer ? { stack: { ...s.stack, [session]: { ...layer, links: merged, ...(neurons ? { neurons } : {}) } } } : {}),
  });
}

/** Tag (or untag) the selected pairs or neurons. */
export function tagSelection(kind: "pair" | "neuron", group: string, op: "add" | "remove"): Promise<void> {
  const { selection } = store.get();
  return tagMembers(kind, group, op, selection.neurons, selection.links);
}

/** Tag (or untag) pairs or neurons of the open session that still need it. */
function tagMembers(kind: "pair" | "neuron", group: string, op: "add" | "remove", neuronSet: Set<number>, linkSet: Set<string>): Promise<void> {
  const { session, neurons } = store.get();
  if (kind === "pair") return tagPairs(new Map([[session!, linksOf(session!).filter((l) => linkSet.has(linkKey(l.ref, l.tgt))).map((l) => [l.ref, l.tgt])]]), group, op);
  const name = group.trim();
  return editTags("neuron", name, op, new Map([[session!, neurons.filter((n) => neuronSet.has(n.idx) && n.groups.includes(name) === (op === "remove")).map((n) => n.id)]]));
}

/** Tag (or untag) pairs of any session that still need it. */
export function tagPairs(pairs: SessionPairs, group: string, op: "add" | "remove"): Promise<void> {
  const name = group.trim();
  const needs = new Map([...pairs].map(([session, ps]) => {
    const has = new Map(linksOf(session).map((l) => [linkKey(l.ref, l.tgt), l.groups.includes(name)]));
    return [session, ps.filter(([r, t]) => has.get(linkKey(r, t)) === (op === "remove"))];
  }));
  return editTags("pair", name, op, needs);
}

/** One edit, however many sessions it spans: one undo step, one toast. */
async function editTags(kind: "pair" | "neuron", name: string, op: "add" | "remove", edits: Map<string, (number | number[])[]>): Promise<void> {
  const n = [...edits.values()].reduce((a, m) => a + m.length, 0);
  if (!name) return;
  if (!n) return store.set({ toast: { text: `Nothing to change for "${name}".` } });
  const write = (o: "add" | "remove") => queued(async () => {
    store.set({ busy: "Saving tags…", error: null });
    try {
      for (const [session, members] of edits) {
        if (!members.length) continue;
        const { neurons, links } = await api.tags({ kind, group: name, op: o, session, members });
        takeSession(session, links, neurons);
      }
      countUnsaved();
      const info = await api.sessions();
      store.set({ busy: null, pairGroups: info.pair_groups, neuronGroups: info.neuron_groups, groupMeta: info.group_meta });
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  });
  record({ undo: () => void write(op === "add" ? "remove" : "add"), redo: () => void write(op) });
  if (!(await write(op))) return;
  store.set({ toast: { text: `${op === "add" ? "Tagged" : "Untagged"} ${n} ${kind === "pair" ? "pairs" : "neurons"} "${name}".`, undo } });
}

/** Move pairs to selected, unselected or deleted, as the Qt lists do. */
export const setPairState = (pairs: [number, number][], state: PairState) => movePairs(new Map([[store.get().session!, pairs]]), state);

export async function movePairs(pairs: SessionPairs, state: PairState): Promise<void> {
  const before = new Map([...pairs.keys()].map((session) => [session, new Map(linksOf(session).map((l) => [linkKey(l.ref, l.tgt), l.state]))]));
  const write = (moves: [string, [number, number][], PairState][]) => queued(async () => {
    for (const [session, ps, st] of moves) if (ps.length && !(await writePairState(session, ps, st))) return false;
    countUnsaved();
    return true;
  });
  const forward = [...pairs].map(([session, ps]): [string, [number, number][], PairState] => [session, ps, state]);
  const back = [...pairs].flatMap(([session, ps]) => (["sel", "unsel", "del"] as const).map((st): [string, [number, number][], PairState] =>
    [session, ps.filter(([r, t]) => before.get(session)!.get(linkKey(r, t)) === st), st]));
  record({ undo: () => void write(back), redo: () => void write(forward) });
  if (!(await write(forward))) return;
  const n = forward.reduce((a, [, ps]) => a + ps.length, 0);
  store.set({ toast: { text: `${n} pair${n > 1 ? "s" : ""} → ${({ sel: "selected", unsel: "unselected", del: "deleted" })[state]} (unsaved: ⌘S saves).`, undo } });
}

async function writePairState(session: string, pairs: [number, number][], state: PairState): Promise<boolean> {
  const before = linksOf(session);
  const moving = new Set(pairs.map(([r, t]) => linkKey(r, t)));
  // the move shows at once; the server's answer replaces it, a refusal puts it back
  takeSession(session, before.map((l) => (moving.has(linkKey(l.ref, l.tgt)) ? { ...l, state } : l)));
  store.set({ error: null });
  try {
    const { links } = await api.pairState(session, pairs, state);
    takeSession(session, links);
    return true;
  } catch (error) {
    takeSession(session, before);
    fail(error);
    return false;
  }
}

/** What a hotkey acts on: the grid's picked cells, else the selected pairs, else the focused one. */
export function targetPairs(): SessionPairs {
  const s = store.get();
  const out: SessionPairs = new Map();
  if (s.cells.size) {
    for (const key of s.cells) {
      const [session, r, t] = key.split("|") as [string, string, string];
      out.set(session, [...(out.get(session) ?? []), [Number(r), Number(t)]]);
    }
    return out;
  }
  const keys = s.selection.links.size ? s.selection.links : s.focus?.kind === "pair" ? new Set([linkKey(s.focus.ref, s.focus.tgt)]) : null;
  if (keys) out.set(s.session!, s.links.filter((l) => keys.has(linkKey(l.ref, l.tgt))).map((l) => [l.ref, l.tgt]));
  return out;
}

/** A group hotkey, as in the Qt GUI: tag the target pairs, or untag them when all are already in. */
export function toggleGroup(group: string): Promise<void> {
  const pairs = targetPairs();
  if (!pairs.size) {
    store.set({ toast: { text: "Focus or select a pair first, then press a group's hotkey." } });
    return Promise.resolve();
  }
  const all = [...pairs].every(([session, ps]) => {
    const groups = new Map(linksOf(session).map((l) => [linkKey(l.ref, l.tgt), l.groups]));
    return ps.every(([r, t]) => groups.get(linkKey(r, t))?.includes(group));
  });
  return tagPairs(pairs, group, all ? "remove" : "add");
}

/** Focus the next (or previous) pair in the pair list's order. */
export function stepFocus(step: number): void {
  const s = store.get();
  const list = orderedPairs(visibleLinks(s.links, s.filters, s.neurons), s.neurons, s.pairOrder);
  const next = stepPair(list, s.focus?.kind === "pair" ? s.focus : null, step);
  if (next) focusPair(next.ref, next.tgt);
}

/** Another copy of the network, showing *segment*, set down just past the right edge of everything in the scene. */
export function addNetwork(segment: string, center: [number, number, number], extent: number): void {
  const s = store.get();
  const right = Math.max(center[0] + extent, ...s.networks.map((n) => n.p[0] + extent * 1.2), ...s.stats.boards.map((b) => b.pose.p[0] + 6));
  setNetworks([...s.networks, { id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, segment, p: [right + extent * 0.6, center[1], center[2]] }]);
  if (s.session) ensureSegLinks(s.session, segment);
}

export const moveNetwork = (id: string, p: [number, number, number]) => (id === "main" ? store.set({ mainAt: p }) : setNetworks(store.get().networks.map((n) => (n.id === id ? { ...n, p } : n))));

export const resizeNetwork = (id: string, size: number) => setNetworks(store.get().networks.map((n) => (n.id === id ? { ...n, s: size } : n)));

export function removeNetwork(id: string): void {
  setNetworks(store.get().networks.filter((n) => n.id !== id));
  dropSource(`net:${id}`);
}

export const setNetworks = (networks: NetworkCopy[]) => store.set({ networks });

export const setMainHidden = (mainHidden: boolean) => store.set({ mainHidden });

