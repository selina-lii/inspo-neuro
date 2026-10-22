// README screenshot on surrogate data, with the dev server up: BROWSER=<chromium binary> node docs/demo_screenshot.mjs docs/3d.png
import { chromium } from "playwright-core";
// surrogate project: 4 shanks, neurons along each, pairs with types and strengths; nothing reaches the real API
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const shanks = [0, 1, 2, 3].map((id) => ({ id, x0: id * 200, x1: id * 200 + 20, y0: 0, y1: 800, inferred: false }));
const neurons = [];
for (const s of shanks) for (let k = 0; k < 20; k++) {
  const pyr = rnd() < 0.75;
  neurons.push({ idx: neurons.length, id: neurons.length + 1, x: s.x0 + rnd() * 20, y: 150 + rnd() * 500, shank: s.id, probe_shank: s.id, channel: Math.floor(rnd() * 32),
    type: pyr ? "pyr" : "int", area: s.id < 2 ? "CA1" : "CA3", rate: pyr ? 0.5 + rnd() * 4 : 8 + rnd() * 20, groups: [] });
}
const links = []; const seen = new Set();
while (links.length < 220) {
  const a = neurons[Math.floor(rnd() * neurons.length)], b = neurons[Math.floor(rnd() * neurons.length)];
  if (a === b || seen.has(`${a.idx}-${b.idx}`) || (rnd() < 0.6 && a.shank !== b.shank)) continue;
  seen.add(`${a.idx}-${b.idx}`);
  const ei = a.type === "pyr" ? "E" : "I";
  const type = `${ei} ${a.type.toUpperCase()}→${b.type.toUpperCase()}`;
  links.push({ i: links.length, ref: a.idx, tgt: b.idx, type, ei, state: rnd() < 0.8 ? "sel" : "unsel", groups: [], rules: [], strength: rnd(), fit: null });
}
const S = "demo_session";
// CCGs: a flat baseline from the two rates, a short-lag peak (E) or trough (I) scaled by strength, Poisson-ish noise
const lags = Array.from({ length: 101 }, (_, i) => i - 50);
const hilags = Array.from({ length: 101 }, (_, i) => (i - 50) / 5);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const ccgRows = (axis, gain = 1) => {
  const out = new Float32Array(links.length * axis.length * 2);
  links.forEach((l, k) => {
    const base = 40 + 6 * Math.sqrt(neurons[l.ref].rate * neurons[l.tgt].rate);
    const sign = l.ei === "E" ? 1 : -0.6;
    axis.forEach((lag, i) => {
      const bump = gain * sign * l.strength * base * 1.6 * Math.exp(-((lag - 1.8) ** 2) / 1.2);
      out[k * axis.length * 2 + i] = Math.max(0, base + bump + gauss() * Math.sqrt(base));
      out[k * axis.length * 2 + axis.length + i] = base;
    });
  });
  return out;
};
const pvals = (axis) => { const out = new Float32Array(links.length * axis.length).fill(0.5); links.forEach((l, k) => axis.forEach((lag, i) => { if (Math.abs(lag - 1.8) < 1.5 && l.strength > 0.5) out[k * axis.length + i] = 0.001; })); return out; };
const acgs = (axis) => { const out = new Float32Array(neurons.length * axis.length); neurons.forEach((n, k) => axis.forEach((lag, i) => { out[k * axis.length + i] = Math.abs(lag) < 2 ? 0 : n.rate * (1 + gauss() * 0.1); })); return out; };
const binsOf = (gain) => ({ lowres: ccgRows(lags, gain), highres: ccgRows(hilags, gain), lowres_acg: acgs(lags), highres_acg: acgs(hilags), lowres_p: pvals(lags), lowres_pc: pvals(lags), highres_p: pvals(hilags), highres_pc: pvals(hilags) });
const bins = { all: binsOf(1), "pre-sleep": binsOf(0.7), "post-sleep": binsOf(1.4) };
// a paired stats test: the same strong pairs measured in two segments, drawn as bars (mean ± SEM)
const strong = links.filter((l) => l.strength > 0.55).slice(0, 24);
const values = {}; const rowsOut = [["pre-sleep", "#3a6df0", 0], ["post-sleep", "#e05555", 0.35]].map(([name, color, lift]) => {
  const ids = strong.map((l) => { const id = `${S}|${l.ref}|${l.tgt}|${name}|lowres|strength`; const raw = l.strength * 2 + lift + gauss() * 0.25; values[id] = { pair: `${S}|${l.ref}|${l.tgt}`, session: S, ref: l.ref, tgt: l.tgt, row: name, res: "lowres", metric: "strength", raw }; return id; });
  return { name, color, ids, y: ids.map((id) => values[id].raw) };
});
const row = (id, name, color) => ({ id, name, color, sessions: [S], conn_types: [], segments: [name], resolution: ["lowres"], rules: [], data_type: "strength", follow: null, follow_pickers: [], follow_exclude: false });
const testCfg = { test_type: "paired t-test", sides: "two-sided", direction: "", nonparametric: false, log_transform: false, zscore: false, remove_outliers: false, post_hoc: false, p_adjust: "holm", greenhouse_geisser: false, thin: 0, thin_seed: 0 };
const view = { violin: false, outliers: false, sig_brackets: true, show_n: true, wh_ratio: "1" };
const config = { rows: [row(0, "pre-sleep", "#3a6df0"), row(1, "post-sleep", "#e05555")], test: testCfg, view, display: null };
const result = { resolution: "lowres", metric: "strength", rows: rowsOut, outliers: [], paired: true, one_sample: false, zscored: false, log_shift: null, n: [strong.length, strong.length], brackets: [{ a: "pre-sleep", b: "post-sleep", p_adj: 0.0021 }], res: {} };
const saved = { name: "sleep vs. wake", config, values, results: [result], text: "paired t-test: t(23) = 3.5, p = 0.0021", missing: {}, tail_fallbacks: [] };
const picker = (field, label, items) => ({ field, label, plural: label + "s", items });
const options = {
  pickers: { sess: picker("sessions", "session", [S]), ct: picker("conn_types", "type", ["E PYR→PYR", "E PYR→INT", "I INT→INT", "I INT→PYR"]), seg: picker("segments", "segment", ["pre-sleep", "post-sleep"]),
    res: picker("resolution", "resolution", ["lowres", "highres"]), grp: picker("rules", "group", []), data: picker("data_type", "metric", ["strength"]) },
  families: {}, family_prefix: "", all_segments: "all", disabled_metrics: [], test_types: ["paired t-test"], p_adjust: ["holm"], test_n_groups: { "paired t-test": [2, 2] },
  rules: {}, sides: ["two-sided"], display: {}, colors: ["#3a6df0", "#e05555"], defaults: { test: testCfg, view, row: row(0, "", "#3a6df0"), display: {} },
};
const grid = { id: "gdemo", p: [0, 0, 0], q: [0, 0, 0, 1], source: "net:main", cols: 5, rows: 4, sort: "strength", segMode: "overlay", axis: "x", segments: ["pre-sleep", "post-sleep"], pairs: "shown", page: 0, compact: true, config: "ccg", legend: "legend", summon: true };
const seg = (name, start, stop) => ({ name, intervals: [[start, stop]], start, stop, duration: stop - start });
const segmentList = [seg("all", 0, 7200), seg("pre-sleep", 0, 3600), seg("post-sleep", 3600, 7200)];
const api = (path, method) => {
  if (path === "/projects") return { projects: ["demo"], open: "demo" };
  if (path === "/sessions") return { name: "demo", sessions: [S], pair_groups: [], neuron_groups: [], group_meta: {} };
  if (path === "/workspaces") return { names: ["demo"] };
  if (path.startsWith("/workspaces/")) return method === "GET" ? { tests: [{ id: "tdemo", name: "sleep vs. wake", config }], boards: [], session: S, grids: [grid], pairNodes: [], ties: [], networks: {}, mainHidden: {} } : { ok: true };
  if (path.startsWith("/session/")) return { neurons, links, shanks };
  if (path.startsWith("/areas/")) return { areas: [] };
  if (path.startsWith("/segments/")) return { segments: segmentList, bounds: [0, 7200] };
  if (path.startsWith("/segment_links/")) return { segment: path.split("/")[3], strength: links.map((l) => l.strength), cs: links.map(() => null), on: links.map((l) => l.strength > 0.3) };
  if (path.startsWith("/neuron_values/")) return { rates: {}, specs: [], place: {} };
  if (path.startsWith("/themes/")) return {};
  if (path.startsWith("/extends/")) return { units: [] };
  if (path.startsWith("/fits/")) return { done: 0, total: 0, running: false, fits: [] };
  if (path.startsWith("/traces/")) return { pairs: links.map((l) => [l.ref, l.tgt]), lowres_lags: lags, highres_lags: hilags, n_neurons: neurons.length };
  if (path === "/unsaved") return { unsaved: 0 };
  if (path === "/stats/options") return options;
  if (path === "/stats/saved") return { saved: [{ name: "sleep vs. wake", saved_at: "" }] };
  if (path.startsWith("/stats/saved/")) return saved;
  return undefined;
};
const browser = await chromium.launch({ executablePath: process.env.BROWSER, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const errors = []; page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const unknown = new Set();
await page.route("**/api/**", (r) => {
  const url = new URL(r.request().url());
  const path = url.pathname.replace(/^\/api/, "");
  if (path.endsWith(".bin")) { const a = bins[url.searchParams.get("segment") ?? "all"][path.split("/").pop().replace(".bin", "")]; return r.fulfill({ body: Buffer.from(a.buffer), contentType: "application/octet-stream" }); }
  const out = api(decodeURIComponent(path), r.request().method());
  if (out === undefined) { unknown.add(path); return r.fulfill({ status: 404, json: { detail: "demo" } }); }
  r.fulfill({ json: out });
});
await page.goto("http://localhost:5174/");
await page.waitForFunction(() => window.neuromapStore?.get().links.length, null, { timeout: 60000 });
await page.getByRole("button", { name: "3D" }).click();
await page.waitForTimeout(4000);
// only the CCG and legend panels stay open: they dock on the grid they are cabled to
await page.evaluate(() => window.neuromapStore.set({ panels: window.neuromapStore.get().panels.map((p) => ({ ...p, closed: p.id !== "ccg" && p.id !== "legend", collapsed: false })), toast: null, error: null }));
console.log("poses", JSON.stringify(await page.evaluate(() => { const s = window.neuromapStore.get(); return { boards: s.stats.boards.map((b) => b.pose), grid: s.grids[0] }; })));
// the grid to the network's left, facing front like the board
await page.evaluate(([gp]) => window.neuromapStore.set({ grids: window.neuromapStore.get().grids.map((g) => ({ ...g, p: gp, q: [0, 0, 0, 1] })) }), [JSON.parse(process.env.GRID_P ?? "[-42, 8, 0]")]);
await page.waitForTimeout(1500);
await page.getByRole("button", { name: process.env.VIEW ?? "front" }).click(); await page.waitForTimeout(1500);
await page.getByRole("button", { name: "fit all" }).click(); await page.waitForTimeout(2000);
// every object faces +z: the front view squares up to all of them, as "face me" does for a selection
await page.getByRole("button", { name: "front" }).click(); await page.waitForTimeout(1200);
await page.getByRole("button", { name: "fit all" }).click(); await page.waitForTimeout(1500);
await page.mouse.move(1000, 600); for (let k = 0; k < 3; k++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(150); }
await page.waitForTimeout(1000);
// a card clicked in the grid opens in the CCG config cabled to it
const card = JSON.parse(process.env.CARD ?? "[280, 515]");
await page.mouse.click(card[0], card[1]); await page.waitForTimeout(2000);
await page.evaluate(() => window.neuromapStore.set({ picked3: null, more3: [] })); await page.waitForTimeout(500);
await page.screenshot({ path: process.argv[2] ?? "docs/3d.png" });
console.log("unknown", [...unknown], errors, await page.evaluate(() => window.neuromapStore.get().error));
await browser.close();
