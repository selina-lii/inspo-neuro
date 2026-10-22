// A CCG card in 3D: the CCG panel's own plot, rasterised into a texture.
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import { PICK_COLOR } from "../../core/colors";
import { CcgPlot, H, W } from "../panel/CcgPlot";
import css from "../styles.css?raw";
import { vivid } from "./vivid";

// the plot's own rules; an SVG drawn as an image sees no page stylesheet
const RULES = css.split("\n").filter((l) => l.startsWith(".ccg .")).join("\n");
const VARS = ["--map", "--panel", "--fg", "--muted", "--line", "--accent"];
// a card far away is drawn thick and deep so its curves survive shrinking; up close, as the CCG panel draws it
const FAR = { scale: 3, stroke: 2.6 };

/** A canvas drawn in sRGB, so its whites stay white under the renderer's colour management. */
export function srgb(t: CanvasTexture): CanvasTexture {
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** `near`: 0 for a small card, else the texture scale that matches its pixels on screen. */
export function ccgTexture(plot: Parameters<typeof CcgPlot>[0], picked: boolean, near = 0): CanvasTexture {
  const { scale, stroke } = near ? { scale: near, stroke: 1 } : FAR;
  const curves = near ? plot.curves : plot.curves.map((c) => ({ ...c, color: vivid(c.color), base: c.base && vivid(c.base) }));
  const root = getComputedStyle(document.documentElement);
  const vars = VARS.map((v) => `${v}:${root.getPropertyValue(v)}`).join(";");
  const svg = renderToStaticMarkup(<CcgPlot {...plot} curves={curves} stroke={stroke} card={!near} />).replace(/^<svg([^>]*)>/, (_, attrs: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" style="${vars};font-family:system-ui,sans-serif"${attrs}><style>${RULES}</style>`);
  const c = document.createElement("canvas");
  [c.width, c.height] = [W * scale, H * scale];
  const g = c.getContext("2d")!;
  g.fillStyle = root.getPropertyValue("--map");
  g.fillRect(0, 0, c.width, c.height);
  const t = srgb(new CanvasTexture(c));
  t.anisotropy = 8;
  // up close the texture is drawn at screen resolution: mipmaps would only blur its detail
  if (near) [t.generateMipmaps, t.minFilter] = [false, LinearFilter];
  const img = new Image();
  img.onload = () => {
    g.drawImage(img, 0, 0);
    g.strokeStyle = picked ? PICK_COLOR : root.getPropertyValue("--line");
    g.lineWidth = picked ? 10 : 3;
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, c.width - g.lineWidth, c.height - g.lineWidth);
    t.needsUpdate = true;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return t;
}
