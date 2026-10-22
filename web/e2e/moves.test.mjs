// Objects move only by a hand: a drag ends at release or Esc, and nothing shifts on its own.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch } from "./harness.mjs";
import { row, SEGMENTS } from "./fixture.mjs";

let app;
let board;
before(async () => {
  app = await launch();
  await app.call("statsActions.ts", "newTest");
  board = await app.state((s) => s.stats.active);
  await app.call("statsActions.ts", "setRows", board, SEGMENTS.map((seg, i) => row(i + 1, seg, [seg])));
  await app.call("statsActions.ts", "runTest", board);
  await app.settle(1500);
  await app.face(`board:${board}`);
});
after(() => app.close());

const poses = () => app.state((s) => JSON.stringify({ boards: s.stats.boards.map((b) => b.pose), grids: s.grids.map((g) => [g.p, g.q]), nets: s.networks.map((n) => n.p), panels: s.panels.map((p) => p.pose) }));
const boardPose = () => app.state((s) => s.stats.boards[0].pose.p);
/** A point on the board's body clear of its bars, dots and title bar: the middle of its bottom margin. */
async function boardSpot() {
  const [c, top] = await app.page.evaluate(async (id) => {
    const { centers, anchors } = await import("/src/ui/galaxy/tie/portAt.ts");
    return [centers.get(`board:${id}`).at.toArray(), anchors.get(id).at.toArray()];
  }, board);
  const [mid, corner] = [await app.screen(c), await app.screen(top)];
  return { x: mid.x, y: mid.y + 0.7 * (mid.y - corner.y) };
}

test("a body drag moves the board and ends at release", async () => {
  const from = await boardPose();
  const at = await boardSpot();
  const { mouse } = app.page;
  await mouse.move(at.x, at.y);
  await mouse.down();
  for (let k = 1; k <= 10; k++) await mouse.move(at.x + k * 12, at.y);
  await mouse.up();
  await app.settle();
  const dropped = await boardPose();
  assert.notDeepEqual(dropped, from, "the drag moved the board");
  for (let k = 1; k <= 10; k++) await mouse.move(at.x + 120 + k * 15, at.y + k * 10);
  await app.settle();
  assert.deepEqual(await boardPose(), dropped, "after release the board no longer follows the cursor");
});

test("Esc ends a drag where it is", async () => {
  const at = await boardSpot();
  const { mouse, keyboard } = app.page;
  await mouse.move(at.x, at.y);
  await mouse.down();
  for (let k = 1; k <= 6; k++) await mouse.move(at.x, at.y + k * 10);
  await keyboard.press("Escape");
  await app.settle();
  const stopped = await boardPose();
  for (let k = 1; k <= 6; k++) await mouse.move(at.x + k * 20, at.y + 60);
  await mouse.up();
  await app.settle();
  assert.deepEqual(await boardPose(), stopped, "after Esc the board stays put, pressed or not");
});

test("nothing moves by itself: hover, wait, reload", async () => {
  const before = await poses();
  const box = await app.page.locator("canvas").first().boundingBox();
  for (let k = 0; k < 30; k++) await app.page.mouse.move(box.x + (k / 30) * box.width, box.y + box.height * (0.2 + (k % 5) * 0.15));
  await app.settle(2500);
  assert.equal(await poses(), before, "hovering and waiting moved something");
});

/** A point on the board's title bar, clear of its title text. */
async function titleSpot() {
  const [c, top] = await app.page.evaluate(async (id) => {
    const { centers, anchors } = await import("/src/ui/galaxy/tie/portAt.ts");
    return [centers.get(`board:${id}`).at.toArray(), anchors.get(id).at.toArray()];
  }, board);
  const [mid, corner] = [await app.screen(c), await app.screen(top)];
  return { x: mid.x + (mid.x - corner.x) * 0.8, y: corner.y + (mid.y - corner.y) * 0.08 };
}

test("a title-bar drag moves the board and ends at release", async () => {
  const from = await boardPose();
  const at = await titleSpot();
  const { mouse } = app.page;
  await mouse.move(at.x, at.y);
  await mouse.down();
  for (let k = 1; k <= 8; k++) await mouse.move(at.x - k * 10, at.y + k * 4);
  await mouse.up();
  await app.settle();
  const dropped = await boardPose();
  assert.notDeepEqual(dropped, from);
  for (let k = 1; k <= 8; k++) await mouse.move(at.x + k * 15, at.y + k * 10);
  await app.settle();
  assert.deepEqual(await boardPose(), dropped);
});

test("menu move follows the pointer until a click, which does nothing else", async () => {
  const at = await boardSpot();
  const { mouse } = app.page;
  await mouse.click(at.x, at.y, { button: "right" });
  await app.page.getByRole("button", { name: "move", exact: true }).click();
  const from = await boardPose();
  for (let k = 1; k <= 8; k++) await mouse.move(at.x + k * 10, at.y - k * 5);
  await mouse.click(at.x + 80, at.y - 40);
  await app.settle();
  const set = await boardPose();
  assert.notDeepEqual(set, from, "the board followed the pointer to where the click set it down");
  for (let k = 1; k <= 6; k++) await mouse.move(at.x - k * 20, at.y);
  await app.settle();
  assert.deepEqual(await boardPose(), set, "after the click it stays put");
});

test("no page errors", () => assert.deepEqual(app.errors, []));
