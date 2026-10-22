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

test("no page errors", () => assert.deepEqual(app.errors, []));
