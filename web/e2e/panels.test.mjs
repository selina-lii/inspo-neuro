// Panels in 3D: a select opens a flat list at the page's size, and picking from it changes the setting.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch } from "./harness.mjs";
import { DATA } from "./fixture.mjs";

let app;
before(async () => {
  app = await launch();
  await app.call("statsActions.ts", "newTest");
  await app.call("actions.ts", "openPanel", "stats");
  await app.settle(1500);
});
after(() => app.close());
/** WebGL draw calls in one frame. */
const draws = () => app.page.evaluate(() => new Promise((done) => {
  const gl = document.querySelector("canvas").getContext("webgl2");
  const [de, da] = [gl.drawElements, gl.drawArrays];
  let n = 0;
  gl.drawElements = (...a) => (n++, de.apply(gl, a));
  gl.drawArrays = (...a) => (n++, da.apply(gl, a));
  requestAnimationFrame(() => (n = 0, requestAnimationFrame(() => ((gl.drawElements = de), (gl.drawArrays = da), done(n)))));
}));

test("a select in a 3D panel opens a flat list that sets the value", async () => {
  const select = app.page.locator(".panel3d select", { has: app.page.locator("option", { hasText: "Repeated-measures ANOVA" }) }).first();
  const before = await select.inputValue();
  await select.dispatchEvent("mousedown");
  const list = app.page.locator(".panel-select");
  await list.waitFor({ timeout: 5000 });
  const size = await list.locator("button").first().evaluate((b) => parseFloat(getComputedStyle(b).fontSize));
  assert.ok(size <= 14, `list text ${size}px`);
  await list.locator("button", { hasText: "Repeated-measures ANOVA" }).click();
  assert.notEqual(await select.inputValue(), before, "picking from the list changed the select");
  assert.equal(await app.state((s) => s.stats.tests[0].config.test.test_type), "Repeated-measures ANOVA", "and the test's setting");
  assert.equal(await list.count(), 0, "the list closes");
});

test("tagging picked cards tags them in every session and unlights them, as Esc would", async () => {
  const [a, b] = [DATA.day1.links[0], DATA.day2.links[1]];
  const picked = [`day1|${a.ref}|${a.tgt}`, `day2|${b.ref}|${b.tgt}`];
  await app.page.evaluate((k) => window.neuromapStore.set({ cells: new Set(k) }), picked);
  await app.call("actions.ts", "toggleGroup", "tagged");
  await app.settle(500);
  assert.ok(a.groups.includes("tagged") && b.groups.includes("tagged"), "both sessions' pairs are tagged");
  assert.equal(await app.state((s) => s.cells.size), 0, "the picked cards are unlit");
});

test("a grid's tag picker makes a new tag on the spot", async () => {
  await app.call("gridActions.ts", "addGrid");
  await app.settle(800);
  const l = DATA.day1.links[2];
  await app.page.evaluate((k) => window.neuromapStore.set({ cells: new Set([k]) }), `day1|${l.ref}|${l.tgt}`);
  app.page.once("dialog", (d) => d.accept("fresh"));
  await app.page.locator('select[title="tag the picked pairs, or untag them when all are in"]').selectOption({ label: "new tag…" });
  await app.settle(500);
  assert.ok(l.groups.includes("fresh"));
});

test("a grid's lag window keeps only the lags inside it; clearing both ends shows them all", async () => {
  const lag = (i) => app.page.locator('input[title^="lag window"]').nth(i);
  await lag(0).fill("-5");
  await lag(1).fill("5");
  assert.deepEqual(await app.state((s) => s.grids.at(-1).xlim), [-5, 5]);
  const lags = await app.page.evaluate(async () => {
    const { windowed } = await import("/src/core/grid.ts");
    const t = { lags: [-10, -5, 0, 5, 10], ccg: [1, 2, 3, 4, 5], baseline: [0, 0, 0, 0, 0] };
    return windowed(t, [-5, null]).ccg;
  });
  assert.deepEqual(lags, [2, 3, 4, 5]);
  await app.settle(900);
  assert.ok(app.api.workspaces.main.grids.every((g) => !("xlim" in g)), "the window is not saved");
  await lag(0).fill("");
  await lag(1).fill("");
  assert.equal(await app.state((s) => s.grids.at(-1).xlim), undefined);
});

test("picked cards export a PNG each, named by session, pair and segment alone", async () => {
  const grid = await app.state((s) => s.grids.at(-1).id);
  await app.page.waitForFunction(async (id) => {
    const { drawn } = await import("/src/ui/galaxy/grid/gridCards.ts");
    return drawn.get(id)?.items.filter((x) => x.curves.length).length >= 2;
  }, grid, { timeout: 30000 });
  await app.page.evaluate(async (id) => {
    const { drawn, exportCards } = await import("/src/ui/galaxy/grid/gridCards.ts");
    const keys = drawn.get(id).items.slice(0, 2).map((x) => x.key);
    await exportCards(window.neuromapStore.get().grids.find((g) => g.id === id), keys);
  }, grid);
  const acgs = await app.page.evaluate(async (id) => (await import("/src/ui/galaxy/grid/gridCards.ts")).drawn.get(id).items.find((x) => x.curves.length).curves[0].trace.acgs, grid);
  assert.ok(acgs?.ref?.length && acgs.tgt?.length, "cards carry their pair's ACGs");
  const names = Object.keys(app.api.images);
  assert.equal(names.length, 2);
  for (const n of names) assert.match(n, /^day\d_\d+-\d+_\w+(\+\w+)*$/);
  assert.ok(Object.values(app.api.images).every((png) => png.startsWith("iVBOR")), "PNG data");
});

test("strength sorts inhibitory pairs by how negative, and mixed E/I by size", async () => {
  const order = await app.page.evaluate(async () => {
    const { sortItems } = await import("/src/core/grid.ts");
    const it = (key, ei, strength) => ({ key, ei, strength });
    const keys = (xs) => sortItems(xs, "strength", []).map((x) => x.key).join("");
    return [keys([it("a", "I", -0.1), it("b", "I", -0.9)]), keys([it("a", "E", 0.5), it("b", "I", -0.9), it("c", "E", 0.7)])];
  });
  assert.deepEqual(order, ["ba", "bca"]);
});

test("duplicating a workspace saves its copy and opens it", async () => {
  const grids = await app.state((s) => s.grids.length);
  await app.call("workspaceActions.ts", "duplicateWorkspace");
  assert.equal(await app.state((s) => s.workspace), "main copy");
  assert.equal(app.api.workspaces["main copy"].grids.length, grids);
  assert.equal(await app.state((s) => s.grids.length), grids);
});

test("a pair node's rule stays open while edited, and its values pick as a list does", async () => {
  await app.call("gridActions.ts", "addNode");
  const node = await app.state((s) => s.pairNodes.at(-1).id);
  await app.call("stackActions.ts", "pick3", "node", node);
  await app.settle(800);
  // the bar lies on the node in 3D, wherever the camera is: press it as a click event would
  await app.page.locator(".board-tools button", { hasText: "all pairs" }).dispatchEvent("click");
  await app.page.locator(".rules-pop button", { hasText: "+ rule" }).click();
  const label = (v) => app.page.locator(".rules-pop .rule-values label", { hasText: v });
  // the row's text, not its checkbox
  const value = (v) => ({ click: (o) => label(v).click({ ...o, position: { x: 40, y: 6 } }), locator: (q) => label(v).locator(q) });
  const picked = () => app.page.evaluate((id) => window.neuromapStore.get().pairNodes.find((n) => n.id === id).rules[0].values, node);
  await value("a").click();
  await value("c").click({ modifiers: ["Shift"] });
  assert.deepEqual(await picked(), ["a", "b", "c"]);
  await value("b").click({ modifiers: ["Control"] });
  assert.deepEqual(await picked(), ["a", "c"]);
  await value("d").click();
  assert.deepEqual(await picked(), ["d"]);
  await value("b").locator("input").click();
  assert.deepEqual(await picked(), ["d", "b"], "a checkbox adds its value");
  await value("d").locator("input").click();
  assert.deepEqual(await picked(), ["b"], "and takes it out again");
  // a distance rule takes a number: the slider and the box both set it
  await app.page.locator(".rules-pop button", { hasText: "+ rule" }).click();
  const rule = app.page.locator(".rules-pop .rule").nth(1);
  await rule.locator("select").first().selectOption("pair location");
  await rule.locator("select").nth(1).selectOption("distance");
  const second = () => app.page.evaluate((id) => window.neuromapStore.get().pairNodes.find((n) => n.id === id).rules[1], node);
  assert.deepEqual(await second(), { kind: "pair location", name: "distance", values: ["0"], side: "either" });
  await rule.locator("input[type=range]").fill("150");
  assert.deepEqual((await second()).values, ["150"], "the slider sets it");
  await rule.locator("input[type=number]").fill("820");
  assert.deepEqual((await second()).values, ["820"], "the box takes values past the slider's end");
  await app.page.keyboard.press("Escape");
  await app.page.locator(".board-tools button", { hasText: "on in any segment" }).dispatchEvent("click");
  await app.page.locator(".picker-pop label", { hasText: /^on in all$/ }).click();
  assert.deepEqual(await app.page.evaluate((id) => window.neuromapStore.get().pairNodes.find((n) => n.id === id).segments, node), ["all"], "a segment keeps the pairs on in it");
});

test("flipping one grid's page redraws its own cards alone; the View menu hides cables", async () => {
  const ids = [];
  for (const _ of [0, 1]) {
    await app.call("gridActions.ts", "addGrid");
    ids.push(await app.state((s) => s.grids.at(-1).id));
    await app.call("wireActions.ts", "connect", "net:main", `grid:${ids.at(-1)}`);
  }
  await app.settle(2500);
  await app.page.evaluate(() => {
    window.__canvases = 0;
    const make = document.createElement.bind(document);
    document.createElement = (tag, ...a) => (tag === "canvas" && new Error().stack.includes("ccgTexture") && window.__canvases++, make(tag, ...a));
  });
  await app.call("gridActions.ts", "patchGrid", ids[0], { page: 1 });
  await app.settle(1500);
  const drawn = await app.page.evaluate(() => window.__canvases);
  await app.call("wireActions.ts", "connect", `grid:${ids[0]}`, "panel:legend");
  await app.settle(800);
  const shown = await draws();
  await app.page.evaluate(() => window.neuromapStore.set({ cables: false }));
  await app.settle(300);
  const hidden = await draws();
  await app.page.evaluate(() => window.neuromapStore.set({ cables: true }));
  for (const id of ids) await app.call("gridActions.ts", "removeGrid", id);
  assert.equal(drawn, 12, "the flipped grid's page of 12 cards, and nothing in the other grid");
  assert.ok(hidden < shown, `hiding cables draws less: ${shown} → ${hidden}`);
});

test("a pair picked in another session hides this session's network whole", async () => {
  const shown = await draws();
  const l = await app.state((s) => s.links[0]);
  await app.page.evaluate((pair) => window.neuromapStore.setStats({ pick: { ids: new Set(), pair, lineage: false } }), `day2|${l.ref}|${l.tgt}`);
  await app.settle(300);
  const away = await draws();
  await app.call("statsActions.ts", "clearPick");
  assert.ok(away < shown, `the network drops out: ${shown} → ${away}`);
});

test("cards sit still while peak fits land in the background", async () => {
  app.api.fitting.polls = 3;
  await app.call("actions.ts", "openSession", "day1");
  await app.call("gridActions.ts", "addGrid");
  const g = await app.state((s) => s.grids.at(-1).id);
  await app.call("wireActions.ts", "connect", "net:main", `grid:${g}`);
  await app.settle(2500);
  await app.page.evaluate(() => {
    window.__canvases = 0;
    const make = document.createElement.bind(document);
    document.createElement = (tag, ...a) => (tag === "canvas" && new Error().stack.includes("ccgTexture") && window.__canvases++, make(tag, ...a));
  });
  await app.page.waitForFunction(() => window.neuromapStore.get().links.filter((l) => l.fit).length >= 3, null, { timeout: 20000 });
  await app.settle(500);
  const drawn = await app.page.evaluate(() => window.__canvases);
  await app.call("gridActions.ts", "removeGrid", g);
  assert.equal(drawn, 0, "no card redraws");
});

test("a 3D panel's title bar collapses and expands it", async () => {
  const collapsed = () => app.state((s) => s.panels.find((p) => p.kind === "stats").collapsed);
  const toggle = app.page.locator(".panel3d .space-panel-head button[title=collapse], .panel3d .space-panel-head button[title=expand]").first();
  await toggle.dispatchEvent("click");
  assert.equal(await collapsed(), true);
  await toggle.dispatchEvent("click");
  assert.equal(await collapsed(), false);
});

test("slow data shows as loading at the bottom, and the notice clears when it lands", async () => {
  app.api.slow.ms = 1500;
  const opening = app.call("actions.ts", "openSession", "day2");
  const notice = app.page.locator(".toast.loading");
  await notice.waitFor({ timeout: 5000 });
  assert.match(await notice.innerText(), /day2/);
  await opening;
  app.api.slow.ms = 0;
  await notice.waitFor({ state: "detached", timeout: 20000 });
  await app.call("actions.ts", "openSession", "day1");
});

test("no page errors", () => assert.deepEqual(app.errors, []));
