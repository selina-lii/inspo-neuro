// One pair's stats over time as a card: a point per curve in order, joined by a line, each point in its curve's colour.
import { CanvasTexture } from "three";
import { PICK_COLOR } from "../../../core/colors";
import { srgb } from "../ccgTexture";

const [W, H] = [480, 280];
const PAD = { l: 44, r: 12, t: 30, b: 34 };

export function drawSeries(title: string, points: { label: string; color: string; value: number | null }[], metric: string, picked: boolean): CanvasTexture {
  const root = getComputedStyle(document.documentElement);
  const c = document.createElement("canvas");
  [c.width, c.height] = [W, H];
  const g = c.getContext("2d")!;
  g.fillStyle = root.getPropertyValue("--map");
  g.fillRect(0, 0, W, H);
  const fg = root.getPropertyValue("--fg"), muted = root.getPropertyValue("--muted");
  g.font = "600 15px system-ui, sans-serif";
  g.fillStyle = fg;
  g.textAlign = "center";
  g.fillText(title, W / 2, 19);
  const ys = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const [lo, hi] = ys.length ? [Math.min(0, ...ys), Math.max(0, ...ys)] : [0, 1];
  const span = hi - lo || 1;
  const sx = (i: number) => PAD.l + ((i + 0.5) * (W - PAD.l - PAD.r)) / Math.max(points.length, 1);
  const sy = (v: number) => H - PAD.b - ((v - lo) / span) * (H - PAD.t - PAD.b);
  g.strokeStyle = muted;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(PAD.l, PAD.t);
  g.lineTo(PAD.l, H - PAD.b);
  g.moveTo(PAD.l, sy(0));
  g.lineTo(W - PAD.r, sy(0));
  g.stroke();
  g.font = "12px system-ui, sans-serif";
  g.fillStyle = muted;
  g.textAlign = "right";
  for (const v of [lo, hi]) g.fillText(String(+v.toPrecision(3)), PAD.l - 4, sy(v) + 4);
  g.save();
  g.translate(12, (PAD.t + H - PAD.b) / 2);
  g.rotate(-Math.PI / 2);
  g.textAlign = "center";
  g.fillText(metric, 0, 0);
  g.restore();
  g.strokeStyle = fg;
  g.lineWidth = 2;
  g.beginPath();
  let pen = false;
  points.forEach((p, i) => {
    if (p.value === null) return void (pen = false);
    pen ? g.lineTo(sx(i), sy(p.value)) : g.moveTo(sx(i), sy(p.value));
    pen = true;
  });
  g.stroke();
  g.textAlign = "center";
  points.forEach((p, i) => {
    g.fillStyle = p.color;
    if (p.value !== null) {
      g.beginPath();
      g.arc(sx(i), sy(p.value), 5, 0, 2 * Math.PI);
      g.fill();
    }
    g.fillText(p.label, sx(i), H - PAD.b + 16);
  });
  g.strokeStyle = picked ? PICK_COLOR : root.getPropertyValue("--line");
  g.lineWidth = picked ? 10 : 3;
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
  return srgb(new CanvasTexture(c));
}
