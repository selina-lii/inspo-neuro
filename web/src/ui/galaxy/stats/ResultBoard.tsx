// One test's result as a board in the 3D space: drag its title bar to place it, flip it between resolutions, snap it to an axis.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferGeometry, Float32BufferAttribute, Vector3, type Group, Quaternion } from "three";
import { shownResult, type Board, type StatsPick, type StatsTest, type StatsValue } from "../../../core/stats";
import { slideBoard } from "../../../stackActions";
import { selected3 } from "../../../core/select";
import { PICK_COLOR } from "../../../core/colors";
import { useStore } from "../../useStore";
import { useBody } from "../select3";
import { resizeBoard, setActiveTest } from "../../../statsActions";
import { claimMenu } from "../SpaceMenu";
import { rename, titleTip } from "../titleTip";
import { Corners } from "./BoardCorners";
import { BRACKET_STEP, layoutBoard, MARGIN, ROW_W } from "./boardGeometry";
import { BoardDots } from "./BoardDots";
import { BoardPlot } from "./BoardPlot";
import { useBoardDrag } from "./boardDrag";
import { anchors } from "../tie/portAt";
import { centers, ports } from "../tie/portAt";
import { Label3D } from "./Label3D";

const RES_LABEL: Record<string, string> = { lowres: "lo-res", highres: "hi-res" };

type Props = { board: Board; test: StatsTest; values: Record<string, StatsValue>; grayed: Set<string>; pick: StatsPick; dark: boolean; active: boolean; objectScale: number; playRow: number | null };

export function ResultBoard({ board, test, values, grayed, pick, dark, active, objectScale, playRow }: Props) {
  const full = test.results.find((r) => r.resolution === board.res) ?? test.results[0]!;
  const result = shownResult(full, board.hidden);
  const played = playRow ?? -1;
  const layout = useMemo(() => layoutBoard(result, values, test.config.view), [result, values, test.config.view]);
  const group = useRef<Group>(null);
  const drag = useBoardDrag(board.id, group, (p, q) => slideBoard(board.id, p, q));
  const body = useBody("board", board.id, group);
  const bar = selected3(useStore(), "board", board.id) ? PICK_COLOR : "#3a6df0";
  const [fg, muted, panel] = dark ? ["#e6e7ea", "#8b919c", "#1c1f24"] : ["#23252a", "#7a7f88", "#ffffff"];
  const { w, h } = layout;
  const bracketRoom = (Math.max(0, ...layout.brackets.map((b) => b.level + 1))) * BRACKET_STEP + 0.2;
  const [x0, x1] = [-w / 2 - MARGIN.left, w / 2 + MARGIN.right];
  const [y0, yTop] = [-h / 2 - MARGIN.bottom, h / 2 + bracketRoom];
  const n = test.config.view.show_n ? `  n=${result.n.join("/")}` : "";
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    anchors.set(board.id, { at: g.localToWorld(new Vector3(x0, yTop + MARGIN.title, 0)), q: g.getWorldQuaternion(new Quaternion()), scale: g.getWorldScale(new Vector3()).x, size: Math.max(x1 - x0, yTop - y0), width: x1 - x0 });
    ports.set(`board:${board.id}`, g.localToWorld(new Vector3(x1 + 0.25, yTop + 0.22, 0)));
    centers.set(`board:${board.id}`, { at: g.localToWorld(new Vector3((x0 + x1) / 2, (y0 + yTop) / 2, 0)), size: Math.max(x1 - x0, yTop - y0) * g.scale.x });
  });
  const border = useMemo(() => new BufferGeometry().setAttribute("position", new Float32BufferAttribute([
    x0, y0, 0, x1, y0, 0, x1, y0, 0, x1, yTop + MARGIN.title, 0, x1, yTop + MARGIN.title, 0, x0, yTop + MARGIN.title, 0, x0, yTop + MARGIN.title, 0, x0, y0, 0,
  ], 3)), [x0, x1, y0, yTop]);
  const title = `${board.label || test.name || "unsaved test"} · ${result.metric} (${RES_LABEL[result.resolution] ?? result.resolution})${n}`;

  return (
    <group ref={group} position={board.pose.p} quaternion={board.pose.q} scale={objectScale * (board.pose.s ?? 1)} {...body} onContextMenu={() => claimMenu({ kind: "board", id: board.id })}>
      {/* drawn first: a transparent backing sorted after the far rows would veil them */}
      <mesh position={[(x0 + x1) / 2, (y0 + yTop) / 2, -0.02]} renderOrder={-1} onDoubleClick={(e) => e.stopPropagation()}>
        <planeGeometry args={[x1 - x0, yTop - y0]} />
        <meshBasicMaterial color={panel} transparent opacity={0.88} depthWrite={false} side={2} />
      </mesh>
      <mesh position={[(x0 + x1) / 2, yTop + 0.22, -0.01]} {...drag} {...titleTip(title, drag.onPointerMove)} onClick={(e) => e.delta <= 4 && setActiveTest(test.id)}
        onDoubleClick={(e) => (e.stopPropagation(), rename({ kind: "board", id: board.id }))}>
        <planeGeometry args={[x1 - x0, 0.44]} />
        <meshBasicMaterial color={bar} transparent opacity={0.85} side={2} />
      </mesh>
      <lineSegments geometry={border}><lineBasicMaterial color={bar} /></lineSegments>
      <Label3D text={title} position={[x0 + 0.12, yTop + 0.22, 0]} height={0.24} color="#ffffff" anchor="left" bold />
      <BoardPlot layout={layout} result={result} fg={fg} muted={muted} fade={layout.dots.some((d) => pick.ids.has(d.id)) ? 0.2 : 1} />
      {played >= 0 && layout.rows[played] && (
        <mesh position={[layout.rows[played]!.x, (y0 + yTop) / 2, -0.015]}>
          <planeGeometry args={[ROW_W, yTop - y0]} />
          <meshBasicMaterial color="#ffb000" transparent opacity={0.18} depthWrite={false} side={2} />
        </mesh>
      )}
      <BoardDots board={board.id} layout={layout} values={values} grayed={grayed} pick={pick} res={result.resolution} fg={fg} mode={board.lines ?? "faint"} />
      {active && <Corners group={group} box={[x0, y0, x1, yTop + MARGIN.title]} size={board.pose.s ?? 1} onResize={(s) => resizeBoard(board.id, s)} />}
    </group>
  );
}
