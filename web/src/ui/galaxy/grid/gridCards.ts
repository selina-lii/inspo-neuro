// A grid card's images: what a cell draws and what an export saves are the same plots.
import type { CanvasTexture } from "three";
import { optionsOf, styledCurve, type CcgGrid, type GridItem } from "../../../core/grid";
import { store, type State } from "../../../core/store";
import { api } from "../../../io/api";
import { gridKey } from "../../panel/Legend";
import { ccgTexture, plotPng, type Plot } from "../ccgTexture";
import type { Series } from "./gridSeries";
import { drawSeries } from "./seriesTexture";

export type Look = { keyed: boolean; ylim?: [number, number]; series: Series | null; metric: string };
/** One image of a card: the segments it plots, drawn as a texture or saved as a PNG. */
export type Card = { segment: string; draw(picked: boolean, near: number): CanvasTexture; png(): Promise<string> };

export function cardsOf(s: State, grid: CcgGrid, item: GridItem, look: Look, title: string): Card[] {
  const { ylim } = look;
  if (grid.view === "stats") {
    if (!look.series) return [];
    const points = gridKey(s, grid).map(([label, color]) => ({ label, color, value: look.series![label]?.[item.key] ?? null }));
    const draw = (picked: boolean) => drawSeries(item.title, points, look.metric, picked, ylim);
    return [{ segment: look.metric, draw, png: async () => (draw(false).image as HTMLCanvasElement).toDataURL("image/png") }];
  }
  const o = optionsOf(s, grid);
  const styled = item.curves.map((c) => styledCurve(s, grid, c));
  const card = (segment: string, plot: Plot): Card => ({ segment, draw: (picked, near) => ccgTexture(plot, picked, near), png: () => plotPng(plot) });
  if (grid.segMode === "series") {
    return styled.map((c) => card(c.label, { curves: [{ trace: c.trace, color: c.color, base: c.color, width: c.width, alpha: c.alpha }], fitScale: null, options: o, title: title ? `${title} · ${c.label}` : c.label, ylim }));
  }
  if (!styled.length) return [];
  const curves = [...styled].sort((a, b) => a.layer - b.layer).map((c) => ({ trace: c.trace, color: c.color, name: look.keyed ? "" : c.label, base: c.color, width: c.width, alpha: c.alpha }));
  return [card(styled.map((c) => c.label).join("+"), { curves, fitScale: null, options: o, title, ylim })];
}

/** Each grid's cards as drawn now, for an export of cards on any page. */
export const drawn = new Map<string, { items: GridItem[]; look: Look }>();

/** The picked cards, a PNG each, into the project's image folder: named by session, pair and segment alone. */
export async function exportCards(grid: CcgGrid, keys: string[]): Promise<void> {
  const { items, look } = drawn.get(grid.id)!;
  const images: Record<string, string> = {};
  for (const item of items.filter((x) => keys.includes(x.key))) {
    for (const c of cardsOf(store.get(), grid, item, look, item.title)) {
      images[`${item.session}_${item.pair}_${c.segment}`.replace(/[^\w.+-]+/g, "_")] = (await c.png()).split(",")[1]!;
    }
  }
  const { folder } = await api.saveImages(images);
  store.set({ toast: { text: `Saved ${Object.keys(images).length} images to ${folder}.` } });
}
