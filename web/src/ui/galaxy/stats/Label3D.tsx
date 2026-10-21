// Text that lies in a board's plane and turns with it: drawn once to a canvas texture, no font download.
import { useEffect, useMemo } from "react";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

const PX = 64;   // canvas pixels per text line

type Props = { text: string; position: [number, number, number]; height: number; color: string; anchor?: "left" | "center" | "right"; bold?: boolean };

export function Label3D({ text, position, height, color, anchor = "center", bold = false }: Props) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const font = `${bold ? 600 : 400} ${PX * 0.72}px -apple-system, BlinkMacSystemFont, Inter, sans-serif`;
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 8;
    canvas.height = PX;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 4, PX / 2);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearFilter;
    return { texture: t, aspect: canvas.width / canvas.height };
  }, [text, color, bold]);
  useEffect(() => () => texture.dispose(), [texture]);
  const w = height * aspect;
  const dx = anchor === "left" ? w / 2 : anchor === "right" ? -w / 2 : 0;
  return (
    <mesh position={[position[0] + dx, position[1], position[2]]} raycast={() => null}>
      <planeGeometry args={[w, height]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}
