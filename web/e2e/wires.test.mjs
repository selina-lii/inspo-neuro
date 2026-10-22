// Cables are one list of directed wires: a drag's ends decide the role, one source per target, and old workspaces migrate.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch } from "./harness.mjs";
import { row, SEGMENTS } from "./fixture.mjs";

let app;
let t1;
let g;
before(async () => {
  app = await launch();
  await app.call("statsActions.ts", "newTest");
  t1 = await app.state((s) => s.stats.active);
  await app.call("statsActions.ts", "setRows", t1, SEGMENTS.map((seg, i) => row(i + 1, seg, [seg])));
  await app.call("statsActions.ts", "runTest", t1);
  await app.call("gridActions.ts", "addGrid");
  g = await app.state((s) => s.grids.at(-1).id);
});
after(() => app.close());

const wires = () => app.page.evaluate(async () => {
  const { wiresOf } = await import("/src/core/wires.ts");
  return wiresOf(window.neuromapStore.get()).map((w) => `${w.from}>${w.to}:${w.role}`).sort();
});

test("a new grid draws from the main network", async () => {
  assert.ok((await wires()).includes(`net:main>grid:${g}:pairs`));
});

test("a drag's direction decides the role; a second pair source replaces the first", async () => {
  await app.call("wireActions.ts", "connect", `grid:${g}`, `board:${t1}`);
  // grid → board is a feed, not a source: the network stays the grid's source
  let w = await wires();
  assert.ok(w.includes(`net:main>grid:${g}:pairs`));
  assert.ok(w.includes(`grid:${g}>board:${t1}:feed`), "dragged from the grid, the grid feeds the test");
  await app.call("wireActions.ts", "cut", { from: `grid:${g}`, to: `board:${t1}` });
  await app.call("wireActions.ts", "connect", `board:${t1}`, `grid:${g}`);
  w = await wires();
  assert.ok(w.includes(`board:${t1}>grid:${g}:pairs`));
  assert.ok(!w.includes(`net:main>grid:${g}:pairs`), "one pair source per grid");
  assert.ok(!w.some((x) => x.endsWith(":feed")), "the cut feed is gone, with its rows");
  const fed = await app.state((s) => s.stats.tests.flatMap((t) => t.config.rows.filter((r) => r.fed)).length);
  assert.equal(fed, 0);
});

test("a tray shares its set's source; removing a grid takes its wires", async () => {
  const keys = await app.page.evaluate(async (id) => {
    const { gridPairs } = await import("/src/stackActions.ts");
    return gridPairs(window.neuromapStore.get().grids.find((x) => x.id === id)).slice(0, 5);
  }, g);
  await app.call("gridActions.ts", "moveToTray", g, keys, null);
  const tray = await app.state((s) => s.grids.at(-1).id);
  assert.ok((await wires()).includes(`board:${t1}>grid:${tray}:pairs`));
  await app.call("gridActions.ts", "removeGrid", tray);
  assert.ok(!(await wires()).some((w) => w.includes(`grid:${tray}`)));
});

test("a workspace saved with sources on the grids opens with them as wires", async () => {
  await app.settle(900);   // the open workspace is saved
  const ws = app.api.workspaces.main;
  ws.wires = undefined;
  ws.grids = ws.grids.map((x) => ({ ...x, source: `board:${t1}`, legend: "legend" }));
  await app.page.reload();
  await app.page.waitForFunction(() => window.neuromapStore?.get().stats.tests.length && window.neuromapStore.get().grids.length, null, { timeout: 60000 });
  const w = await wires();
  assert.ok(w.includes(`board:${t1}>grid:${g}:pairs`));
  assert.ok(w.includes(`grid:${g}>panel:legend:legend`));
  assert.ok(await app.state((s) => s.grids.every((x) => !("source" in x) && !("legend" in x))), "the old fields are gone from the grids");
});

test("no page errors", () => assert.deepEqual(app.errors, []));
