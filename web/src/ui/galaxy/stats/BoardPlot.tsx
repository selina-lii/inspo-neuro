// A board's static plot: axes and ticks, bars or violins per row, row names, significance brackets.
import { useEffect, useMemo } from "react";
import { Vector2 } from "three";
import type { StatsResult } from "../../../core/stats";
import { BRACKET_STEP, type BoardLayout, type BoardRow } from "./boardGeometry";
import { Label3D } from "./Label3D";
import { rimMaterial } from "./rim";
import { Segments } from "./Segments";

const TEXT = 0.2;

// bodies, not flat shapes, so every row reads from any angle: a violin turned about its row's axis, a bar as a box
function Violin({ row, toY, fade }: { row: BoardRow; toY(v: number): number; fade: number }) {
  const material = useMemo(() => rimMaterial(row.color, fade), [row.color, fade]);
  useEffect(() => () => material.dispose(), [material]);
  const points = useMemo(() => {
    const pts = row.violin!;
    return [new Vector2(0, toY(pts[0]!.y)), ...pts.map((p) => new Vector2(p.half, toY(p.y))), new Vector2(0, toY(pts[pts.length - 1]!.y))];
  }, [row, toY]);
  return (
    <mesh position={[row.x, 0, 0]} raycast={() => null} material={material}>
      <latheGeometry args={[points, 32]} />
    </mesh>
  );
}

function Bar({ x, y0, y1, half, color, fade }: { x: number; y0: number; y1: number; half: number; color: string; fade: number }) {
  const material = useMemo(() => rimMaterial(color, fade), [color, fade]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh position={[x, (y0 + y1) / 2, 0]} raycast={() => null} material={material}>
      <boxGeometry args={[half * 2, Math.max(Math.abs(y1 - y0), 0.001), half * 2]} />
    </mesh>
  );
}

const ROD = 0.035;

// a slim solid bar in the row's colour, opaque so it reads through the translucent body
function Rod({ x0, y0, x1, y1, color, fade }: { x0: number; y0: number; x1: number; y1: number; color: string; fade: number }) {
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, 0]} raycast={() => null}>
      <boxGeometry args={[Math.max(Math.abs(x1 - x0), ROD), Math.max(Math.abs(y1 - y0), ROD), ROD]} />
      <meshBasicMaterial color={color} transparent={fade < 1} opacity={fade} />
    </mesh>
  );
}

/** `fade`: below 1 while a picked value on this board takes the eye. */
export function BoardPlot({ layout, result, fg, muted, fade }: { layout: BoardLayout; result: StatsResult; fg: string; muted: string; fade: number }) {
  const { w, h, toY, rows, ticks, brackets, zeroY } = layout;
  const [left, bottom, top] = [-w / 2, -h / 2, h / 2];
  const half = (w / rows.length) * 0.4;
  const clampY = (y: number) => Math.min(Math.max(y, bottom), top);
  const lines = useMemo(() => ({
    frame: [left, bottom, left, top, left, bottom, w / 2, bottom],
    grid: ticks.flatMap((t) => [left, t.y, w / 2, t.y]),
    brackets: brackets.flatMap((b) => {
      const y = top + 0.18 + b.level * BRACKET_STEP;
      return b.x0 === b.x1 ? [] : [b.x0, y, b.x1, y, b.x0, y, b.x0, y - 0.06, b.x1, y, b.x1, y - 0.06];
    }),
    zero: zeroY === null ? [] : [left, zeroY, w / 2, zeroY],
  }), [layout]);
  const yLabel = result.log_shift !== null ? (result.log_shift ? `log(value + ${result.log_shift.toPrecision(4)})` : "log(value)") : "";

  return (
    <group>
      <Segments points={lines.grid} color={muted} opacity={0.35 * fade} />
      <Segments points={lines.frame} color={muted} width={1.4} opacity={fade} />
      <Segments points={lines.zero} color={muted} width={1} opacity={0.8 * fade} />
      {ticks.map((t) => (
        <Label3D key={t.v} text={String(Number(t.v.toPrecision(4)))} position={[left - 0.08, t.y, 0]} height={TEXT * 0.85} color={muted} anchor="right" />
      ))}
      {rows.map((r, i) => (
        <group key={i}>
          {r.bar && (() => {
            const [y0, y1] = [clampY(toY(0)), clampY(toY(r.bar.mean))];
            return (
              <Bar x={r.x} y0={y0} y1={y1} half={half} color={r.color} fade={fade} />
            );
          })()}
          {r.violin && <Violin row={r} toY={toY} fade={fade} />}
          {r.bar && (() => {
            const [lo, hi, m] = [clampY(toY(r.bar.mean - r.bar.sem)), clampY(toY(r.bar.mean + r.bar.sem)), clampY(toY(r.bar.mean))];
            return (
              <>
                <Rod x0={r.x} y0={lo} x1={r.x} y1={hi} color={r.color} fade={fade} />
                <Rod x0={r.x - 0.08} y0={lo} x1={r.x + 0.08} y1={lo} color={r.color} fade={fade} />
                <Rod x0={r.x - 0.08} y0={hi} x1={r.x + 0.08} y1={hi} color={r.color} fade={fade} />
                <Rod x0={r.x - half} y0={m} x1={r.x + half} y1={m} color={r.color} fade={fade} />
              </>
            );
          })()}
          {r.median !== null && <Rod x0={r.x - half * 0.5} y0={toY(r.median)} x1={r.x + half * 0.5} y1={toY(r.median)} color={r.color} fade={fade} />}
          <Label3D text={r.name} position={[r.x, bottom - 0.22, 0]} height={TEXT} color={fg} />
        </group>
      ))}
      <Segments points={lines.brackets} color={fg} width={1.2} opacity={fade} />
      {brackets.map((b, i) => (
        <Label3D key={i} text={b.star} position={[(b.x0 + b.x1) / 2, top + 0.27 + b.level * BRACKET_STEP, 0]} height={TEXT} color={fg} />
      ))}
      {(yLabel || result.zscored) && (
        <Label3D text={`${yLabel || "value"}${result.zscored ? ": z from first row" : ""}`} position={[left, bottom - 0.5, 0]} height={TEXT * 0.8} color={muted} anchor="left" />
      )}
    </group>
  );
}
