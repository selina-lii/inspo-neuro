// Surrogate project for the browser tests: two sessions sharing neuron indices (so a pair's session matters), four
// segments, and a stats engine whose every value is a known function of (session, ref, tgt, segment).

export const SESSIONS = ["day1", "day2"];
export const SEGMENTS = ["P1", "P2", "P3", "P4"];
const LAGS = Array.from({ length: 41 }, (_, i) => i - 20);
const HILAGS = LAGS.map((l) => l / 5);

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function sessionData(session, seed) {
  const rnd = rng(seed);
  const shanks = [0, 1].map((id) => ({ id, x0: id * 200, x1: id * 200 + 20, y0: 0, y1: 600, inferred: false }));
  const neurons = Array.from({ length: 24 }, (_, i) => {
    const s = shanks[i % 2];
    return { idx: i, id: 100 + i, x: s.x0 + rnd() * 20, y: 100 + rnd() * 400, shank: s.id, probe_shank: s.id, channel: i, type: i % 4 ? "pyr" : "int", area: "CA1", rate: 1 + rnd() * 5, groups: [] };
  });
  const links = [];
  const seen = new Set();
  while (links.length < 40) {
    const [a, b] = [Math.floor(rnd() * 24), Math.floor(rnd() * 24)];
    if (a === b || seen.has(`${a}-${b}`)) continue;
    seen.add(`${a}-${b}`);
    links.push({ i: links.length, ref: a, tgt: b, type: "E PYR→PYR", ei: "E", state: "sel", groups: [], rules: [], strength: Math.round(rnd() * 100) / 100, fit: null });
  }
  return { session, neurons, links, shanks };
}

export const DATA = Object.fromEntries(SESSIONS.map((s, k) => [s, sessionData(s, 11 + k * 7)]));

/** The value every engine path reports for a pair in a segment: distinct per session, pair and segment. */
export function valueOf(session, ref, tgt, segment) {
  let h = 2166136261;
  for (const c of `${session}|${ref}|${tgt}|${segment}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const rowValue = (session, ref, tgt, segments) => mean(segments.map((seg) => valueOf(session, ref, tgt, seg)));

const picker = (field, label, items) => ({ field, label, plural: `${label}s`, items });
const testCfg = { test_type: "One-way ANOVA + Tukey", sides: "two-sided", direction: "", nonparametric: false, log_transform: false, zscore: false, remove_outliers: false, post_hoc: false, p_adjust: "holm", greenhouse_geisser: false, thin: 0, thin_seed: 0 };
const view = { violin: false, outliers: true, sig_brackets: false, show_n: true, wh_ratio: "1" };
const COLORS = ["#3a6df0", "#e05555", "#2e9d57", "#d08a1f"];
export const row = (id, name, segments, extra = {}) => ({ id, name, color: COLORS[id % 4], sessions: SESSIONS, conn_types: [], segments, resolution: ["lowres"], rules: [], data_type: "Conn Strength", follow: null, follow_pickers: [], follow_exclude: false, ...extra });
export const OPTIONS = {
  pickers: { sess: picker("sessions", "session", SESSIONS), ct: picker("conn_types", "type", ["E PYR→PYR"]), seg: picker("segments", "segment", SEGMENTS),
    res: picker("resolution", "resolution", ["lowres"]), grp: picker("rules", "group", []), data: picker("data_type", "metric", ["Conn Strength"]) },
  families: {}, family_prefix: "", all_segments: "all", disabled_metrics: [], test_types: ["One-way ANOVA + Tukey", "Repeated-measures ANOVA"], p_adjust: ["holm"], test_n_groups: { "One-way ANOVA + Tukey": [2, 99], "Repeated-measures ANOVA": [2, 99] },
  rules: { "pair tag": { "": ["a", "b", "c", "d"] }, "pair location": { "same shank": ["yes", "no"], distance: [] } }, sides: ["two-sided"], display: {}, colors: COLORS, defaults: { test: testCfg, view, row: row(0, "", []), display: {} },
};

/** What the server's stats run returns: every row's pairs (its fed pairs alone when it has them) and their values.
 * A test's CS settings shift every value it measures (`display.offset`), so two tests' values never coincide. */
export function runStats(config) {
  const offset = config.display?.offset ?? 0;
  const values = {};
  const rows = config.rows.map((r) => {
    const only = r.pairs ? new Set(r.pairs) : null;
    const ids = [];
    const y = [];
    for (const s of r.sessions.length ? r.sessions : SESSIONS) {
      for (const l of DATA[s].links) {
        const pair = `${s}|${l.ref}|${l.tgt}`;
        if (only && !only.has(pair)) continue;
        const id = `${pair}|${r.name}|lowres|${r.data_type}`;
        const v = rowValue(s, l.ref, l.tgt, r.segments) + offset;
        values[id] = { pair, session: s, ref: l.ref, tgt: l.tgt, row: r.name, res: "lowres", metric: r.data_type, raw: v };
        ids.push(id);
        y.push(v);
      }
    }
    return { name: r.name, color: r.color, ids, y };
  });
  const result = { resolution: "lowres", metric: config.rows[0]?.data_type ?? "Conn Strength", rows, outliers: [], paired: false, one_sample: false, zscored: false, log_shift: null, n: rows.map((r) => r.ids.length), brackets: [], res: {} };
  return { values, results: [result], text: "surrogate", missing: {}, tail_fallbacks: [] };
}

const seg = (name, start, stop) => ({ name, intervals: [[start, stop]], start, stop, duration: stop - start });
const SEGMENT_LIST = [seg("all", 0, 14400), ...SEGMENTS.map((n, i) => seg(n, i * 3600, (i + 1) * 3600))];
const segLinks = (session, segment) => {
  const links = DATA[session].links;
  return { segment, strength: links.map((l) => l.strength), cs: links.map((l) => valueOf(session, l.ref, l.tgt, segment)), on: links.map(() => true) };
};
// highres peaks twice as tall, so a card shows which resolution it drew
const trace = (session, ref, tgt, segment, res = "lowres") => [LAGS.map((lag) => 10 + (res === "highres" ? 40 : 20) * valueOf(session, ref, tgt, segment) * Math.exp(-(lag ** 2) / 8)), LAGS.map(() => 10), LAGS.map(() => 5), LAGS.map(() => 5)];

/** The API as the server answers it, kept in memory: workspaces persist across reloads of one browser context. */
export function makeApi() {
  const fitting = { polls: 0 };
  // `slow.ms` > 0: every answer takes that long, as a big session's would
  const slow = { ms: 0 };
  const saved = {};
  const workspaces = { main: { tests: [], boards: [], session: SESSIONS[0] } };
  const jobs = [];
  const images = {};
  const json = (path, method, body) => {
    if (path === "/projects") return { projects: ["surrogate"], open: "surrogate" };
    if (path === "/sessions") return { name: "surrogate", sessions: SESSIONS, pair_groups: [], neuron_groups: [], group_meta: {} };
    if (path === "/workspaces") return { names: Object.keys(workspaces) };
    if (path.startsWith("/workspaces/")) {
      const name = decodeURIComponent(path.split("/")[2]);
      if (method === "PUT") return (workspaces[name] = body), { ok: true };
      return workspaces[name];
    }
    if (path.startsWith("/session/")) return DATA[path.split("/")[2]];
    if (path.startsWith("/areas/")) return { areas: [] };
    if (path.startsWith("/segments/")) return { segments: SEGMENT_LIST, bounds: [0, 14400] };
    if (path.startsWith("/segment_links/")) return segLinks(path.split("/")[2], path.split("/")[3]);
    if (path.startsWith("/neuron_values/")) return { rates: {}, specs: [], place: {} };
    if (path.startsWith("/themes/")) return {};
    if (path.startsWith("/extends/")) return { units: [] };
    if (path.startsWith("/fits/")) {
      // `fitting.polls` > 0: peak fits run in the background, one landing per poll
      const l = DATA[path.split("/")[2]].links[fitting.polls];
      return fitting.polls-- > 0 ? { done: 1, total: 9, running: true, fits: [{ ref: l.ref, tgt: l.tgt, fitted: false, confident: false }] } : { done: 0, total: 0, running: false, fits: [] };
    }
    if (path.startsWith("/traces/")) {
      const s = path.split("/")[2];
      return { pairs: DATA[s].links.map((l) => [l.ref, l.tgt]), lowres_lags: LAGS, highres_lags: HILAGS, n_neurons: DATA[s].neurons.length };
    }
    if (path === "/unsaved") return { unsaved: 0 };
    if (path === "/stats/options") return OPTIONS;
    if (path === "/stats/saved") return { saved: Object.keys(saved).map((name) => ({ name, saved_at: "" })) };
    if (path.startsWith("/stats/saved/")) {
      const name = decodeURIComponent(path.split("/")[3]);
      return { name, config: saved[name], ...runStats(saved[name]) };
    }
    if (path === "/stats/run") return { job: jobs.push(body) - 1 };
    if (path.startsWith("/stats/run/")) return { status: "done", config: jobs[Number(path.split("/")[3])], ...runStats(jobs[Number(path.split("/")[3])]) };
    if (path === "/stats/series") {
      return Object.fromEntries(body.curves.map((c) => [c.label, Object.fromEntries(body.pairs.map((k) => {
        const [s, r, t] = k.split("|");
        return [k, rowValue(s, Number(r), Number(t), c.segments) + (body.display?.offset ?? 0)];
      }))]));
    }
    if (path === "/tags") {
      for (const [s, members] of Object.entries(body.members)) for (const [r, t] of members) {
        const l = DATA[s].links.find((x) => x.ref === r && x.tgt === t);
        l.groups = body.op === "add" ? [...new Set([...l.groups, body.group])] : l.groups.filter((g) => g !== body.group);
      }
      return Object.fromEntries(Object.keys(body.members).map((s) => [s, DATA[s]]));
    }
    if (path === "/images") return Object.assign(images, body.images), { folder: "/surrogate/images" };
    if (path === "/pick") return { pairs: (body.sessions.length ? body.sessions : SESSIONS).flatMap((s) => DATA[s].links.map((l) => `${s}|${l.ref}|${l.tgt}`)) };
    return undefined;
  };
  const stack = (session, q) => {
    const segs = (q.get("segments") ?? "").split(",").filter(Boolean);
    const pairs = (q.get("pairs") ?? "").split(",").filter(Boolean);
    const d = DATA[session];
    return {
      neurons: d.neurons, links: d.links, shanks: d.shanks, hours: Object.fromEntries(segs.map((s) => [s, 1])), lags: LAGS,
      seg_links: Object.fromEntries(segs.map((s) => [s, segLinks(session, s)])),
      traces: Object.fromEntries(segs.map((s) => [s, Object.fromEntries(pairs.map((p) => {
        const [r, t] = p.split("-").map(Number);
        return [p, trace(session, r, t, s, q.get("res") ?? "lowres")];
      }))])),
    };
  };
  const bin = (session, res, segment) => {
    const links = DATA[session].links;
    const kind = res.replace(/_.*/, "");
    const n = LAGS.length;
    if (res.endsWith("_acg")) return new Float32Array(DATA[session].neurons.length * n).fill(1);
    if (res.endsWith("_p") || res.endsWith("_pc")) return new Float32Array(links.length * n).fill(0.5);
    const out = new Float32Array(links.length * n * 2);
    links.forEach((l, k) => {
      const [ccg, base] = trace(session, l.ref, l.tgt, segment, kind);
      out.set(ccg, k * n * 2);
      out.set(base, k * n * 2 + n);
    });
    return out;
  };
  return { json, stack, bin, workspaces, images, fitting, slow, saved };
}
