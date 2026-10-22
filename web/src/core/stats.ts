// Stats tests as the Python StatsTestBackend sees them, plus the pure logic of boards in the 3D space. No React here.

export type Rule = { kind: string; name: string; values: string[]; side: string };

/** One group row; field names are NeuroPy's RowConfig, so a config round-trips with the Qt panel. */
export type RowConfig = {
  id: number; name: string; color: string;
  sessions: string[]; conn_types: string[]; segments: string[]; resolution: string[];
  rules: Rule[]; data_type: string;
  follow: number | null; follow_pickers: string[]; follow_exclude: boolean;
  fed?: string; pairs?: string[];   // a row a CCG grid feeds: its pairs ("session|ref|tgt") alone, kept in step with the grid
};

export type TestConfig = {
  test_type: string | null; sides: string; direction: string; nonparametric: boolean; log_transform: boolean;
  zscore: boolean; remove_outliers: boolean; post_hoc: boolean; p_adjust: string; greenhouse_geisser: boolean; thin: number; thin_seed: number;
};

export type ViewConfig = { violin: boolean; outliers: boolean; sig_brackets: boolean; show_n: boolean; wh_ratio: string };

export type StatsConfig = { rows: RowConfig[]; test: TestConfig; view: ViewConfig; display: Record<string, unknown> | null };

export type PickerKey = "sess" | "ct" | "seg" | "res" | "grp" | "data";
export type ListPickerKey = Exclude<PickerKey, "grp" | "data">;

export type StatsOptions = {
  pickers: Record<PickerKey, { field: keyof RowConfig; label: string; plural: string; items: string[] }>;
  families: Record<string, string[]>;
  family_prefix: string;
  all_segments: string;
  disabled_metrics: string[];
  test_types: string[];
  p_adjust: string[];
  test_n_groups: Record<string, [number, number | null]>;
  rules: Record<string, Record<string, string[]>>;
  sides: string[];
  display: Record<string, string>;
  colors: string[];
  defaults: { test: TestConfig; view: ViewConfig; row: RowConfig; display: Record<string, unknown> };
};

/** One measured value: a pair's metric in one row's segments at one resolution. Every board showing it shares this record. */
export type StatsValue = { pair: string; session: string; ref: number; tgt: number; row: string; res: string; metric: string; raw: number | null };

export type ResultRow = { name: string; color: string; ids: string[]; y: (number | null)[] };

export type Bracket = { a: string; b: string | null; p_adj: number };

export type StatsResult = {
  resolution: string; metric: string; rows: ResultRow[]; outliers: string[];
  paired: boolean; one_sample: boolean; zscored: boolean; log_shift: number | null;
  n: number[]; brackets: Bracket[]; res: Record<string, unknown>;
};

export type StatsPayload = {
  values: Record<string, StatsValue>; results: StatsResult[]; text: string;
  missing: Record<string, string[]>; tail_fallbacks: unknown[][];
};

export type StatsTest = {
  id: string;
  name: string;   // the saved file's name; '' until saved
  config: StatsConfig;
  job: number | null;   // the server run whose result this holds: saving needs it
  status: "idle" | "running" | "done" | "error";
  error: string;
  text: string;
  results: StatsResult[];
  warnings: string[];
  stale?: boolean;   // a grid feeding it changed since this result
};

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Pose = { p: Vec3; q: Quat; s?: number };   // s: the board's own size, on top of the shared object size

export type PairLines = "off" | "faint" | "picked";

/** A test's results drawn on one board in 3D; one board per test. */
export type Board = { id: string; res: string; pose: Pose; lines?: PairLines; unplaced?: boolean; hidden?: string[] };   // unplaced: opened before the 3D view measured the network; hidden: row names left off its plot

export type StatsPick = { ids: Set<string>; pair: string | null; lineage: boolean };

export type StatsState = {
  options: StatsOptions | null;
  saved: { name: string; saved_at: string }[];
  tests: StatsTest[];
  active: string | null;
  values: Record<string, StatsValue>;
  boards: Board[];
  pick: StatsPick;
  hover: { id: string; x: number; y: number } | null;   // the value under the cursor, at its screen point
};

export const EMPTY_STATS: StatsState = { options: null, saved: [], tests: [], active: null, values: {}, boards: [], pick: { ids: new Set(), pair: null, lineage: false }, hover: null };

export const PICKER_ORDER: PickerKey[] = ["sess", "ct", "seg", "res", "grp", "data"];

/** Picker keys a row mirrors from its leader, as StatsTestBackend.followed_pickers. */
export function followedPickers(row: RowConfig): PickerKey[] {
  if (row.follow === null) return [];
  const chosen = new Set(row.follow_pickers.length ? row.follow_pickers : PICKER_ORDER);
  return PICKER_ORDER.filter((k) => chosen.has(k) !== row.follow_exclude);
}

/** Rows with their followed fields copied from the row above, as the backend resolves them before a run. */
export function resolveFollows(rows: RowConfig[], options: StatsOptions): RowConfig[] {
  const byId = new Map<number, RowConfig>();
  return rows.map((row) => {
    const leader = row.follow === null ? undefined : byId.get(row.follow);
    let out = row;
    if (leader) for (const k of followedPickers(row)) out = { ...out, [options.pickers[k].field]: leader[options.pickers[k].field] };
    byId.set(row.id, out);
    return out;
  });
}

/** A column is locked when every row below the top follows it. */
export const lockedColumn = (rows: RowConfig[], k: PickerKey): boolean =>
  rows.length > 1 && rows.slice(1).every((r) => followedPickers(r).includes(k));

/** Make every row below the top follow (or stop following) column `k`; a row follows the one above it. */
export function lockColumn(rows: RowConfig[], k: PickerKey, on: boolean): RowConfig[] {
  return rows.map((r, i) => {
    if (i === 0) return r;
    const now = new Set(followedPickers(r));
    if (on) now.add(k);
    else now.delete(k);
    return { ...r, follow: now.size ? rows[i - 1]!.id : null, follow_pickers: PICKER_ORDER.filter((x) => now.has(x)), follow_exclude: false };
  });
}

export function newRow(rows: RowConfig[], options: StatsOptions, copy?: RowConfig): RowConfig {
  const id = Math.max(0, ...rows.map((r) => r.id)) + 1;
  const i = rows.length;
  // a fresh row picks every item where the Qt picker would, since an empty pick reads as none to the backend
  const base = copy ?? { ...options.defaults.row, sessions: options.pickers.sess.items, conn_types: options.pickers.ct.items,
    resolution: options.pickers.res.items, data_type: options.pickers.data.items[0] ?? "" };
  return { ...base, id, name: i < 26 ? String.fromCharCode(65 + i) : `G${i + 1}`, color: options.colors[i % options.colors.length]!, follow: null, follow_pickers: [], follow_exclude: false };
}

/** Picking a family in row `at` deals its members out from that row down, adding rows that copy it. */
export function dealFamily(rows: RowConfig[], at: number, members: string[], options: StatsOptions): RowConfig[] {
  const out = [...rows];
  while (out.length < at + members.length) out.push(newRow(out, options, out[at]));
  members.forEach((seg, k) => (out[at + k] = { ...out[at + k]!, segments: [seg], name: seg }));
  return out;
}

/** Every value of the same pair on a board, in row order: the pair's lineage across the test's conditions. */
const shownCache = new WeakMap<StatsResult, Map<string, StatsResult>>();

/** A result as its board shows it: the rows it hides left out, the same object for the same hide. */
export function shownResult(result: StatsResult, hidden: string[] = []): StatsResult {
  if (!hidden.length) return result;
  const byKey = shownCache.get(result) ?? new Map<string, StatsResult>();
  shownCache.set(result, byKey);
  const key = hidden.join("\n");
  if (!byKey.has(key)) {
    const keep = result.rows.map((r) => !hidden.includes(r.name));
    byKey.set(key, { ...result, rows: result.rows.filter((_, i) => keep[i]), n: result.n.filter((_, i) => keep[i]) });
  }
  return byKey.get(key)!;
}

export function lineageIds(result: StatsResult, values: Record<string, StatsValue>, pair: string): string[] {
  return result.rows.flatMap((r) => r.ids.filter((id) => values[id]?.pair === pair));
}

/** A pair measured in more than one row is a repeated measure: its values are joined across rows. */
export function repeatedPairs(result: StatsResult, values: Record<string, StatsValue>): Set<string> {
  const rowsOf = new Map<string, number>();
  for (const r of result.rows) for (const pair of new Set(r.ids.map((id) => values[id]?.pair))) if (pair) rowsOf.set(pair, (rowsOf.get(pair) ?? 0) + 1);
  return new Set([...rowsOf].filter(([, n]) => n > 1).map(([p]) => p));
}

const AXIS_QUATS: Record<string, Quat> = {
  "+z": [0, 0, 0, 1],
  "-z": [0, 1, 0, 0],
  "+x": [0, Math.SQRT1_2, 0, Math.SQRT1_2],
  "-x": [0, -Math.SQRT1_2, 0, Math.SQRT1_2],
  "+y": [-Math.SQRT1_2, 0, 0, Math.SQRT1_2],
  "-y": [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
};

/** A board's orientation with its face (local +z) toward `axis`, upright where that is defined. */
export const axisQuat = (axis: string): Quat => AXIS_QUATS[axis]!;

/** New boards line up right of the network, each beside the last; `half`: the new board's half width in the world. */
/** A new board faces +x, right of the network, in the first free place along z: boards already far away do not push it out. */
export function defaultPose(boards: Board[], center: Vec3, extent: number, half: number): Pose {
  const x = center[0] + extent / 2 + 4 + half;
  const step = 2 * half + 2;
  let k = 0;
  while (boards.some((b) => Math.hypot(b.pose.p[0] - x, b.pose.p[2] - (center[2] - k * step)) < half)) k++;
  return { p: [x, center[1], center[2] - k * step], q: axisQuat("+x") };
}
