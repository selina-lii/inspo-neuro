// One app per test file: Vite on a free port, Chromium with every /api call answered by the surrogate fixture.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { makeApi } from "./fixture.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export async function launch() {
  const vite = await createServer({ root: ROOT, configFile: `${ROOT}/vite.config.ts`, server: { port: 0, strictPort: false }, logLevel: "error" });
  await vite.listen();
  const url = vite.resolvedUrls.local[0];
  const browser = await chromium.launch({ executablePath: process.env.BROWSER, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const api = makeApi();
  await page.route("**/api/**", async (r) => {
    const u = new URL(r.request().url());
    if (api.slow.ms) await new Promise((done) => setTimeout(done, api.slow.ms));
    const path = decodeURIComponent(u.pathname.replace(/^\/api/, ""));
    if (path.endsWith(".bin")) {
      const [, , session, file] = path.split("/");
      const a = api.bin(session, file.replace(".bin", ""), u.searchParams.get("segment") ?? "all");
      return r.fulfill({ body: Buffer.from(a.buffer), contentType: "application/octet-stream" });
    }
    if (path.startsWith("/stack/")) return r.fulfill({ json: api.stack(path.split("/")[2], u.searchParams) });
    const body = r.request().postData();
    const out = api.json(path, r.request().method(), body ? JSON.parse(body) : undefined);
    if (out === undefined) return r.fulfill({ status: 404, json: { detail: `surrogate has no ${path}` } });
    return r.fulfill({ json: out });
  });
  await page.goto(url);
  await page.waitForFunction(() => window.neuromapStore?.get().links.length, null, { timeout: 60000 });
  await page.waitForFunction(() => window.neuromapCamera, null, { timeout: 30000 });
  // panels closed: the tests look at objects in the space
  await page.evaluate(() => window.neuromapStore.set({ panels: window.neuromapStore.get().panels.map((p) => ({ ...p, closed: true })) }));
  const app = {
    page, api, errors,
    /** The store's state, or a value computed from it in the page. */
    state: (f = (s) => s) => page.evaluate(`(${f})(window.neuromapStore.get())`),
    /** Run an app module's export in the page: the same module instance the app uses. */
    call: (module, fn, ...args) => page.evaluate(async ([m, f, a]) => (await import(m))[f](...a), [`/src/${module}`, fn, args]),
    /** Where a world point is on screen, in page pixels. */
    screen: (p) => page.evaluate(([x, y, z]) => {
      const c = window.neuromapCamera;
      const v = c.position.clone().set(x, y, z).project(c);
      const box = document.querySelector("canvas").getBoundingClientRect();
      return { x: box.left + ((v.x + 1) / 2) * box.width, y: box.top + ((1 - v.y) / 2) * box.height };
    }, p),
    settle: (ms = 400) => page.waitForTimeout(ms),
    /** Look straight at an object (its kind:id), from far enough to see it whole. */
    face: async (key) => {
      await page.evaluate(async (k) => {
        const { centers, anchors } = await import("/src/ui/galaxy/tie/portAt.ts");
        const c = centers.get(k);
        const a = anchors.get(k.startsWith("board:") ? k.slice(6) : k);
        const normal = c.at.clone().set(0, 0, 1).applyQuaternion(a.q);
        const up = c.at.clone().set(0, 1, 0).applyQuaternion(a.q);
        window.neuromapView.look(c.at, normal, up, c.size * 1.3);
      }, key);
      await page.waitForTimeout(600);
    },
    async close() {
      await browser.close();
      await vite.close();
    },
  };
  return app;
}
