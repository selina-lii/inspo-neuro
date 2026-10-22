// One store holds the app state; views derive from it through useSyncExternalStore.
import type { Playback, StackLayer, Tie } from "./stack";
import { EMPTY_STATS, type Pose, type StatsState } from "./stats";
import type { Area, ExtendUnit, GroupMeta, LayoutKind, Link, Neuron, NeuronValues, Point, Point3, SegLinks, Segment, Selection, Shank } from "./types";
import type { CcgGrid, PairNode } from "./grid";

export type Filters = {
  types: Set<string>;
  states: Set<Link["state"]>;
  groups: Set<string>;
  groupMode: "any" | "all";
  rule: string;
  confidentOnly: boolean;
  minStrength: number;
  onOnly: boolean;   // only links on in their map's segment
  hideSameChannel: boolean;
  hideSameShank: boolean;
};

/** An object in the 3D space that can be selected and deleted: a network is "main" or a copy's id; a tie is its board's id. */
export type Picked3 = { kind: "board" | "panel" | "network" | "tie" | "grid"; id: string };

export type Toast = { text: string; undo?: () => void } | null;

/** One map in the space: the same neurons, shown for one segment, offset from the first map. */
export type MapInstance = { id: string; segment: string; dx: number; dy: number };
/** A network copy in 3D: *p* is where its centre sits in the scene, *s* its own size. */
export type NetworkCopy = { id: string; segment: string; p: [number, number, number]; s?: number };

/** A panel: a React Flow node at x/y in 2D, an object at its pose in 3D; w and h, in pixels, serve both. */
export type SpacePanel = { id: string; kind: "details" | "ccg" | "timeline" | "pairs" | "stats" | "legend" | "metadata"; x: number; y: number; w: number; h: number; auto: boolean; collapsed?: boolean; closed?: boolean; pose?: Pose; summon?: boolean; ccg?: CcgOptions; pair?: string | null };   // summon: bring it in front of the 3D camera; ccg: an added CCG panel's own options; pair: "session|ref|tgt" last clicked in a grid it configures

/** How links are coloured: by type, by strength in their map's segment, by change from `a` to `b`, or by on/off in `a` vs `b`. */
export type LinkColor = { kind: "type" | "strength" | "change" | "onoff" | "group" | "ends"; a: string; b: string };

/** What a link's dash and width stand for. */
export type LinkEncoding = { dash: "uncertain" | "off" | "unselected" | "none"; width: "strength" | "constant"; measure: "excess" | "cs" };

/** The CCG plot's options, as in the Qt panel; `norms` follow NeuroPy's NormalizeBy names and order. */
export type CcgOptions = {
  res: "lowres" | "highres"; baseline: boolean; acgRef: boolean; acgTgt: boolean; fit: boolean; line: boolean; window: boolean;
  p: boolean; pc: boolean; wf: boolean; jitter: boolean; norms: string[];
  extend: string;   // '' = the stored CCG; else '<name>|<window_ms>|<bin_ms>|<segment>' of a stored extend unit
};

export type State = {
  project: string | null;
  projects: string[];
  workspace: string | null;   // the named arrangement of the project's space that is open
  workspaces: string[];
  picker: boolean;   // the project picker is up over an open project
  sessions: string[];
  session: string | null;
  pairGroups: string[];
  neuronGroups: string[];
  groupMeta: Record<string, GroupMeta>;
  pairOrder: "strength" | "ref" | "type";   // the pair list's order, which the arrow keys step through
  neurons: Neuron[];
  links: Link[];
  shanks: Shank[];
  segments: Segment[];
  bounds: [number, number];
  themes: Record<string, [number, number, string][]>;
  extendUnits: ExtendUnit[];   // epoch themes (paradigm, brain states…) as the Qt time slider has them
  shownThemes: string[];
  segLinks: Record<string, SegLinks>;   // per segment, loaded on first use
  neuronValues: NeuronValues | null;
  overview: boolean;   // the 2D overview map in the corner
  sweep: { on: boolean; open: Set<number> };   // minesweeper mode: each clicked neuron opens its neighbours too
  networks: NetworkCopy[];   // extra copies of this session's network in 3D, each showing one segment
  objectScale: number;   // size of the objects placed in 3D (boards, panels, CCG cards), together
  cardScale: number;   // the CCG cards' own size, on top of objectScale
  ties: Tie[];   // stats boards cabled to a network: the network grows into the test's session stack
  stack: Record<string, StackLayer>;   // per session, a stack layer's data, fetched once
  stackCards: "picked" | "all";   // on a stack, overlay cards for the picked pair or every pair in the test
  playback: Playback | null;
  pickCard: StackLayer | null;   // the picked stats dot's pair across the test's rows, fetched alone for its card
  picked3: Picked3 | null;   // the object selected in 3D: what Delete removes
  gizmo: boolean;   // the selection carries its transform gizmo: a ⌘-click selected it
  more3: Picked3[];   // the rest of a shift-click selection; picked3 leads it
  mainHidden: boolean;
  mainAt: [number, number, number];   // the open session's network, moved from where its layout puts it
  grids: CcgGrid[];   // CCG grids placed in 3D
  pairNodes: PairNode[];   // pair filters cabled between a source and grids   // the open session's own network closed in 3D
  tieOnAdd: boolean;   // a stats test added to the space brings in its sessions' networks: its board is tied to the main network
  thumbs: "focused" | "selected" | "shown";   // which pairs carry a CCG card in 3D
  unsaved: number;   // edits the server holds in memory, not yet written
  linkAlpha: number;   // multiplies every link's opacity
  neuronColor: string;   // 'type', 'area', 'rate:<seg>', 'ratio:<a>/<b>', 'spec:<name>', 'specv:<name>', 'place:<seg>'
  linkColor: LinkColor;
  encoding: LinkEncoding;
  maps: MapInstance[];
  activeMap: string;   // the map the time slider, the CCG plot and the filters follow
  panels: SpacePanel[];
  ccg: CcgOptions;
  spacing: number;   // how far neurons that share a shank or a site fan apart
  layout: LayoutKind;
  axes: { x: string; y: string };
  positions: Point[];
  areas: Area[];
  view: "2d" | "3d";
  zMetric: string;
  embedding3: Point3[] | null;   // the 3D t-SNE of the open session, fetched when the 3D embedding is first shown
  traces: string | null;   // '<session>:<segment>' whose CCG traces are in memory
  filters: Filters;
  selection: Selection;
  cells: Set<string>;   // grid cells picked with shift or ⌘, "session|ref|tgt": hotkeys act on them
  focus: { kind: "pair"; ref: number; tgt: number } | { kind: "neuron"; idx: number } | null;
  fitProgress: { done: number; total: number; running: boolean } | null;
  toast: Toast;
  busy: string | null;
  error: string | null;
  stats: StatsState;
};

export const ALL_TYPES = ["E PYR→PYR", "E PYR→INT", "I INT→INT", "I INT→PYR"];

/** An object's title text in world units at scale 1 (0.24-high label lines, the font 0.72 of that): every title matches it. */
export const TITLE_FONT = 0.24 * 0.72;

/** World units per panel pixel in 3D: a panel's 12px title as tall as an object's. */
export const PANEL_PX = TITLE_FONT / 12;

export const DEFAULT_CCG: CcgOptions = { res: "highres", baseline: true, acgRef: false, acgTgt: false, fit: true, line: false, window: true, p: false, pc: false, wf: false, jitter: false, norms: [], extend: "" };

/** A CCG panel's options: the first panel's are the app's own, an added panel keeps its own; a gone panel gives the defaults. */
export const panelCcg = (s: State, id: string): CcgOptions => (id === "ccg" ? s.ccg : s.panels.find((p) => p.id === id)?.ccg ?? DEFAULT_CCG);

export const DEFAULT_PANELS: SpacePanel[] = [
  { id: "ccg", kind: "ccg", x: 0, y: 0, w: 440, h: 330, auto: true },
  { id: "details", kind: "details", x: 0, y: 0, w: 430, h: 760, auto: true },
  { id: "timeline", kind: "timeline", x: 0, y: 0, w: 1300, h: 250, auto: true },
  { id: "pairs", kind: "pairs", x: 0, y: 0, w: 330, h: 760, auto: true },
  { id: "stats", kind: "stats", x: 0, y: 0, w: 760, h: 520, auto: true, collapsed: true },
  { id: "legend", kind: "legend", x: 0, y: 0, w: 560, h: 150, auto: true },
  { id: "metadata", kind: "metadata", x: 0, y: 0, w: 300, h: 150, auto: true, collapsed: true },
];

const initial: State = {
  project: null,
  projects: [],
  workspace: null,
  workspaces: [],
  picker: false,
  sessions: [],
  session: null,
  pairGroups: [],
  neuronGroups: [],
  groupMeta: {},
  pairOrder: "strength",
  neurons: [],
  links: [],
  shanks: [],
  segments: [],
  bounds: [0, 1],
  themes: {},
  extendUnits: [],
  shownThemes: ["paradigm", "brainstates"],
  segLinks: {},
  neuronValues: null,
  overview: false,
  sweep: { on: false, open: new Set() },
  networks: [],
  objectScale: 0.6,
  cardScale: 1,
  ties: [],
  stack: {},
  stackCards: "picked",
  playback: null,
  pickCard: null,
  picked3: null,
  gizmo: false,
  more3: [],
  grids: [],
  pairNodes: [],
  mainHidden: false,
  mainAt: [0, 0, 0],
  tieOnAdd: true,
  thumbs: "selected",
  unsaved: 0,
  linkAlpha: 1,
  neuronColor: "type",
  linkColor: { kind: "type", a: "pre", b: "maze" },
  encoding: { dash: "uncertain", width: "strength", measure: "excess" },
  maps: [{ id: "m0", segment: "all", dx: 0, dy: 0 }],
  activeMap: "m0",
  panels: DEFAULT_PANELS,
  ccg: DEFAULT_CCG,
  spacing: 1,
  layout: "physical",
  axes: { x: "rate", y: "out strength" },
  positions: [],
  areas: [],
  view: "2d",
  zMetric: "log rate",
  embedding3: null,
  traces: null,
  filters: { types: new Set(ALL_TYPES), states: new Set(["sel"]), groups: new Set(), groupMode: "any", rule: "", confidentOnly: false, minStrength: 0, onOnly: false, hideSameChannel: false, hideSameShank: false },
  selection: { neurons: new Set(), links: new Set() },
  cells: new Set(),
  focus: null,
  fitProgress: null,
  toast: null,
  busy: null,
  error: null,
  stats: EMPTY_STATS,
};

export class Store {
  private state: State = initial;
  private listeners = new Set<() => void>();

  get = (): State => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  setStats(patch: Partial<StatsState>): void {
    this.set({ stats: { ...this.state.stats, ...patch } });
  }

  setFilters(patch: Partial<Filters>): void {
    this.set({ filters: { ...this.state.filters, ...patch } });
  }
}

export const store = new Store();

export const activeSegment = (s: State): string => s.maps.find((m) => m.id === s.activeMap)?.segment ?? "all";

// a hot-swapped store would split the app between two states: reload the page instead
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
