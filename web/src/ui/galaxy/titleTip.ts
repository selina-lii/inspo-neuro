// A 3D object's title bar: hovered, its full title in large type at the cursor; double-clicked, renamed.
import type { ThreeEvent } from "@react-three/fiber";
import type { CcgGrid, PairNode, StyleNode } from "../../core/grid";
import type { Board } from "../../core/stats";
import { store } from "../../core/store";

let tip: HTMLDivElement | null = null;
const tipEl = () => (tip ??= document.body.appendChild(Object.assign(document.createElement("div"), { className: "title-tip" })));

const show = (text: string, e: ThreeEvent<PointerEvent>) => {
  const el = tipEl();
  el.textContent = text;
  el.style.display = "block";
  el.style.left = `${e.clientX + 14}px`;
  el.style.top = `${e.clientY + 18}px`;
};
const hide = () => void (tip && (tip.style.display = "none"));

/** Hover handlers for a title bar. */
export const titleTip = (text: string) => ({
  onPointerOver: (e: ThreeEvent<PointerEvent>) => show(text, e),
  onPointerMove: (e: ThreeEvent<PointerEvent>) => show(text, e),
  onPointerOut: hide,
});

type Named = { kind: "board" | "grid" | "node" | "style"; id: string };

/** Ask for an object's name; an empty answer goes back to its default. */
export function rename({ kind, id }: Named): void {
  hide();
  const s = store.get();
  const list = { board: s.stats.boards, grid: s.grids, node: s.pairNodes, style: s.styleNodes }[kind] as { id: string; label?: string }[];
  const answer = window.prompt("name", list.find((x) => x.id === id)?.label ?? "");
  if (answer === null) return;
  const label = answer.trim() || undefined;
  const named = <T extends { id: string; label?: string }>(xs: T[]) => xs.map((x) => (x.id === id ? { ...x, label } : x));
  if (kind === "board") store.setStats({ boards: named(s.stats.boards as (Board & { label?: string })[]) });
  else if (kind === "grid") store.set({ grids: named(s.grids as CcgGrid[]) });
  else if (kind === "node") store.set({ pairNodes: named(s.pairNodes as PairNode[]) });
  else store.set({ styleNodes: named(s.styleNodes as StyleNode[]) });
}
