// Stats 1 gives the pairs, a tray of them feeds stats 2: every value on the way must belong to its own pair.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch } from "./harness.mjs";
import { row, SEGMENTS, valueOf } from "./fixture.mjs";

let app;
before(async () => void (app = await launch()));
after(() => app.close());

const ROWS = SEGMENTS.map((seg, i) => row(i + 1, seg, [seg]));
const expected = (key, segments, offset = 0) => {
  const [s, r, t] = key.split("|");
  return segments.reduce((a, seg) => a + valueOf(s, Number(r), Number(t), seg), 0) / segments.length + offset;
};

async function newRunTest(rows) {
  await app.call("statsActions.ts", "newTest");
  const id = await app.state((s) => s.stats.active);
  if (rows) await app.call("statsActions.ts", "setRows", id, rows);
  return id;
}

/** The grid's stats-view values as its cards read them. */
const series = (grid, keys) => app.page.evaluate(async ([g, k]) => {
  const { seriesResult } = await import("/src/ui/galaxy/grid/gridSeries.ts");
  const s = window.neuromapStore.get();
  return seriesResult(s, s.grids.find((x) => x.id === g), k)?.series ?? null;
}, [grid, keys]);

const gridKeys = (grid) => app.page.evaluate(async (g) => {
  const { gridPairs } = await import("/src/stackActions.ts");
  return gridPairs(window.neuromapStore.get().grids.find((x) => x.id === g));
}, grid);

test("stats 1 → tray → stats 2 keeps every pair's own values", async () => {
  const t1 = await newRunTest(ROWS);
  await app.call("statsActions.ts", "runTest", t1);
  const values = await app.state((s) => s.stats.values);
  for (const v of Object.values(values)) assert.equal(v.raw, expected(v.pair, [v.row]), `stats 1 value of ${v.pair} in ${v.row}`);

  await app.call("gridActions.ts", "addGrid");
  const g1 = await app.state((s) => s.grids.at(-1).id);
  await app.call("wireActions.ts", "connect", `board:${t1}`, `grid:${g1}`);
  await app.call("gridActions.ts", "patchGrid", g1, { view: "stats" });
  await app.settle(1500);
  const all = await gridKeys(g1);
  assert.equal(all.length, 80, "the grid holds stats 1's pairs, both sessions");

  // a tray of pairs from both sessions, including the same ref-tgt in two sessions where there is one
  const picked = all.filter((_, i) => i % 3 === 0);
  await app.call("gridActions.ts", "sendToTray", g1, picked, null, false);
  const g2 = await app.state((s) => s.grids.at(-1).id);
  assert.deepEqual((await gridKeys(g2)).sort(), [...picked].sort(), "the new tray holds exactly the moved pairs");
  assert.equal((await gridKeys(g1)).filter((k) => picked.includes(k)).length, 0, "a pair lives in one tray");

  // stats 2 measures under its own CS settings: its values differ from stats 1's for the same pair
  const t2 = await newRunTest();
  await app.call("statsActions.ts", "updateConfig", t2, { display: { offset: 10 } });
  await app.call("wireActions.ts", "connect", `grid:${g2}`, `board:${t2}`);
  await app.settle(800);
  const fed = await app.page.evaluate((id) => window.neuromapStore.get().stats.tests.find((t) => t.id === id).config.rows, t2);
  assert.equal(fed.length, 4, "one fed row per grid curve");
  for (const r of fed) {
    assert.deepEqual([...r.pairs].sort(), [...picked].sort(), `${r.name} draws from the tray's pairs alone`);
    assert.deepEqual(r.segments, [r.curve], `${r.name} measures its own curve's segment`);
  }

  await app.call("statsActions.ts", "runTest", t2);
  await app.settle(800);
  const s2 = await series(g2, picked);
  assert.ok(s2, "the tray's stats view reads stats 2");
  for (const seg of SEGMENTS) for (const k of picked) assert.equal(s2[seg][k], expected(k, [seg], 10), `tray card ${k}, curve ${seg}: stats 2's value`);

  const rest = await gridKeys(g1);
  const s1 = await series(g1, rest);
  for (const seg of SEGMENTS) for (const k of rest) assert.equal(s1[seg][k], expected(k, [seg]), `first tray card ${k}, curve ${seg}`);

  // the CCG panel's resolution reaches the cards of a board-fed grid
  await app.call("wireActions.ts", "connect", "panel:ccg", `grid:${g1}`);
  await app.call("actions.ts", "setCcgOptions", { res: "lowres" });
  await app.page.waitForFunction(() => Object.values(window.neuromapStore.get().stack).every((l) => l.ccgs.lowres && l.ccgs.highres), null, { timeout: 30000 });
  assert.deepEqual(app.errors, []);
});
