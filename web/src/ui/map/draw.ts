// Canvas drawing of links and neuron dots, in screen space under one viewport.
import { PICK_COLOR, type LinkStyle } from "../../core/colors";
import type { Link, Point } from "../../core/types";

export type Viewport = { x: number; y: number; scale: number };

export const toScreen = (p: Point, v: Viewport): Point => ({ x: p.x * v.scale + v.x, y: p.y * v.scale + v.y });

/** The bend of a link: to the left of its direction, so A→B and B→A never share a path. */
export function control(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: (a.x + b.x) / 2 - dy * 0.2, y: (a.y + b.y) / 2 + dx * 0.2 };
}

export function bezier(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/** Screen width of a link from its 0–1 strength step, thickening a little with zoom. */
export function linkWidth(step: number, scale: number): number {
  return (1.6 + 5 * step) * Math.min(Math.max(Math.sqrt(scale), 0.9), 1.3);
}

export function distanceToLink(p: Point, a: Point, b: Point): number {
  const c = control(a, b);
  let best = Infinity;
  let prev = a;
  for (let i = 1; i <= 16; i++) {
    const q = bezier(a, c, b, i / 16);
    best = Math.min(best, segmentDistance(p, prev, q));
    prev = q;
  }
  return best;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function drawLink(ctx: CanvasRenderingContext2D, link: Link, a: Point, b: Point, scale: number, style: LinkStyle, halo: boolean, nodeRadius: number): void {
  const color = style.color;
  const width = linkWidth(style.width, scale);
  if (a.x === b.x && a.y === b.y) return;
  const c = control(a, b);
  // stop short of the target so the arrowhead sits on its edge
  const end = bezier(a, c, b, 1 - Math.min(0.45, (nodeRadius + 2) / Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1)));
  const tangent = { x: end.x - c.x, y: end.y - c.y };
  const tl = Math.hypot(tangent.x, tangent.y) || 1;
  const ux = tangent.x / tl;
  const uy = tangent.y / tl;
  const head = 5 + width * 1.6;
  const shaftEnd = { x: end.x - ux * head * 0.7, y: end.y - uy * head * 0.7 };

  ctx.save();
  ctx.globalAlpha = style.alpha;
  if (halo) {
    ctx.strokeStyle = PICK_COLOR;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = width + 6;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(c.x, c.y, shaftEnd.x, shaftEnd.y);
    ctx.stroke();
  }
  ctx.globalAlpha = style.alpha;
  if (style.color2) {
    const g = ctx.createLinearGradient(a.x, a.y, end.x, end.y);
    g.addColorStop(0, color);
    g.addColorStop(1, style.color2);
    ctx.strokeStyle = g;
  } else ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.setLineDash(style.dashed ? [width * 2.5, width * 2] : []);
  if (!link.fit) ctx.globalAlpha = style.alpha * 0.7;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(c.x, c.y, shaftEnd.x, shaftEnd.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = style.color2 ?? color;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - ux * head - uy * head * 0.55, end.y - uy * head + ux * head * 0.55);
  ctx.lineTo(end.x - ux * head + uy * head * 0.55, end.y - uy * head - ux * head * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
