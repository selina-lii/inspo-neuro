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
  await app.call("gridActions.ts", "sendToTray", g, keys, null, false);
  const tray = await app.state((s) => s.grids.at(-1).id);
  assert.ok((await wires()).includes(`board:${t1}>grid:${tray}:pairs`));
  await app.call("gridActions.ts", "removeGrid", tray);
  assert.ok(!(await wires()).some((w) => w.includes(`grid:${tray}`)));
});

test("copied pairs stay in their tray and sit once in the other", async () => {
  const pairs = (id) => app.page.evaluate(async (id) => {
    const { gridPairs } = await import("/src/stackActions.ts");
    return gridPairs(window.neuromapStore.get().grids.find((x) => x.id === id));
  }, id);
  const all = await pairs(g);
  await app.call("gridActions.ts", "sendToTray", g, all.slice(0, 3), null, true);
  const tray = await app.state((s) => s.grids.at(-1).id);
  await app.call("gridActions.ts", "sendToTray", g, all.slice(0, 5), tray, true);
  assert.deepEqual((await pairs(tray)).sort(), all.slice(0, 5).sort(), "a pair sits once in a tray");
  assert.deepEqual((await pairs(g)).sort(), [...all].sort(), "a copy leaves the first tray whole");
  await app.call("gridActions.ts", "sendToTray", g, all.slice(0, 2), tray, false);
  assert.deepEqual((await pairs(g)).sort(), all.slice(2).sort(), "a move takes them out");
  await app.call("gridActions.ts", "removeGrid", g);
  const heir = await app.state((s) => s.grids.at(-1).id);
  assert.deepEqual((await pairs(heir)).sort(), [...all].sort(), "the next tray inherits what the first held");
  g = heir;
});

test("replacing a test hands its cables to the other test", async () => {
  await app.call("statsActions.ts", "newTest");
  const t2 = await app.state((s) => s.stats.active);
  await app.call("stackActions.ts", "tie", t1, "main");
  await app.call("wireActions.ts", "replace", `board:${t1}`, `board:${t2}`);
  const w = await wires();
  assert.ok(w.includes(`board:${t2}>grid:${g}:pairs`), "the grid now draws from the new test");
  assert.ok(w.some((x) => x.startsWith(`board:${t2}>net:`) && x.endsWith(":tie")), "and the tie moved");
  assert.ok(!w.some((x) => x.includes(`board:${t1}`)), "the old test keeps none");
  await app.call("wireActions.ts", "replace", `board:${t2}`, `board:${t1}`);
  await app.call("stackActions.ts", "untie", t1);
});

test("replacing a test with a new one hands it the old one's cables and place", async () => {
  const pose = await app.page.evaluate((id) => window.neuromapStore.get().stats.boards.find((b) => b.id === id)?.pose, t1);
  await app.page.evaluate(async (id) => {
    const { replaceTest, newTest } = await import("/src/statsActions.ts");
    await replaceTest(id, (x) => newTest(x));
  }, t1);
  const t2 = await app.state((s) => s.stats.active);
  const w = await wires();
  assert.ok(w.includes(`board:${t2}>grid:${g}:pairs`), "the grid now draws from the new test");
  assert.ok(!w.some((x) => x.includes(`board:${t1}`)), "the old test keeps none");
  assert.ok(!(await app.state((s) => s.stats.tests.map((t) => t.id))).includes(t1), "and closes");
  await app.call("statsActions.ts", "setRows", t2, SEGMENTS.map((seg, i) => row(i + 1, seg, [seg])));
  await app.call("statsActions.ts", "runTest", t2);
  await app.settle(800);
  const now = await app.page.evaluate((id) => window.neuromapStore.get().stats.boards.find((b) => b.id === id)?.pose, t2);
  assert.deepEqual(now, pose, "its board lands where the old one stood");
  t1 = t2;
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

test("a CCG panel cabled to three grids stays on the first; one added from it shows in view", async () => {
  await app.call("actions.ts", "openPanel", "ccg");
  const ids = [];
  for (const _ of [0, 1, 2]) {
    await app.call("gridActions.ts", "addGrid");
    ids.push(await app.state((s) => s.grids.at(-1).id));
    await app.call("wireActions.ts", "connect", "panel:ccg", `grid:${ids.at(-1)}`);
  }
  await app.settle(1000);
  const on = await app.page.evaluate(async () => (await import("/src/core/grid.ts")).dockedOn(window.neuromapStore.get(), "ccg"));
  assert.equal(on, ids[0]);
  await app.call("actions.ts", "addCcgPanel", "ccg");
  await app.settle(1500);
  const added = await app.state((s) => s.panels.at(-1).id);
  // the newest panel's element is the last one placed
  const box = await app.page.locator(".panel3d").last().boundingBox();
  assert.ok(box && box.x < 1600 && box.x + box.width > 0 && box.y < 900 && box.y + box.height > 0, `the new panel is on screen: ${JSON.stringify(box)}`);
  await app.call("actions.ts", "closePanel", added);
  for (const id of ids) await app.call("gridActions.ts", "removeGrid", id);
});

