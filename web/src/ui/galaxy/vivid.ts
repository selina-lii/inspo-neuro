// Row colours are pastel; seen small or see-through in 3D they fade into the white, so 3D draws them deeper.
import { Color, SRGBColorSpace } from "three";

export function vivid(css: string, lightness = 0.48): string {
  const c = new Color(css);
  const { h, s, l } = c.getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);
  return `#${c.setHSL(h, Math.max(s, 0.75), Math.min(l, lightness), SRGBColorSpace).getHexString(SRGBColorSpace)}`;
}
