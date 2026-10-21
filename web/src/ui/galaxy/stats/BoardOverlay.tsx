// Object toolbars, placed in 3D by the panel layer on each object's top edge, and the dot tooltip over the canvas.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GridBar } from "../grid/GridBar";
import { Quaternion, Vector3 } from "three";
import type { Board } from "../../../core/stats";
import { setActiveTest, setBoardLines, setBoardRes } from "../../../statsActions";
import { openPanelAt } from "../../../actions";
import { bars, elementFor, PANEL_PX } from "../Panels3D";
import { anchors } from "../tie/portAt";
import { snap3 } from "../select3";
import type { Vec3 } from "../../../core/stats";
import { pausePlayback, playRows, setPlaybackSpeed, stepRow, stackOf, stopPlayback, tie, untie } from "../../../stackActions";
import { store } from "../../../core/store";
import { useStore } from "../../useStore";

const RES_LABEL: Record<string, string> = { lowres: "lo-res", highres: "hi-res" };

/** Outside the canvas: one toolbar per board, and the hovered value's tooltip at the cursor. */
export function BoardToolbars({ onNormalTo }: { onNormalTo(board: Board, size: number): void }) {
  const s = useStore();
  const { boards, tests, hover, values } = s.stats;
  const box = useRef<HTMLDivElement>(null);
  const r = box.current?.getBoundingClientRect();
  const hv = hover && values[hover.id];
  return (
    <div className="board-overlay" ref={box}>
      {boards.map((b) => {
        const test = tests.find((t) => t.id === b.id);
        if (!test?.results.length) return null;
        return (
          <FloatBar key={b.id} id={b.id}>
            {test.results.length > 1 && test.results.map((res) => (
              <button key={res.resolution} className={res.resolution === b.res ? "on" : ""} onClick={() => setBoardRes(b.id, res.resolution)}>
                {RES_LABEL[res.resolution] ?? res.resolution}
              </button>
            ))}
            <span className="sep" />
            {["+x", "+y", "+z"].map((axis) => (
              <button key={axis} title={`turn the board to face ${axis}`} onClick={() => snap3({ kind: "board", id: b.id }, axis)}>{axis}</button>
            ))}
            <button title="look at the board straight on" onClick={() => onNormalTo(b, anchors.get(b.id)?.size ?? 8)}>⊥</button>
            <button title="this test's editor beside the board: change its rows or test, rerun, save" onClick={() => editBoard(b)}>⚙ edit</button>
            <span className="sep" />
            <select title="pair lines: a pair's values joined across rows" value={b.lines ?? "faint"} onChange={(e) => setBoardLines(b.id, e.target.value as typeof b.lines)}>
              <option value="off">pair lines off</option>
              <option value="faint">pair lines faint</option>
              <option value="picked">picked pair only</option>
            </select>
            {s.ties.some((t) => t.board === b.id) && <TieTools board={b.id} />}
          </FloatBar>
        );
      })}
      {s.grids.map((g) => <GridBar key={g.id} grid={g} />)}
      {hover && hv && r && (
        <div className="tip board-tip" style={{ left: hover.x - r.left, top: hover.y - r.top }}>
          {hv.session} #{hv.ref}→#{hv.tgt} · {hv.row} · {hv.raw === null ? "–" : Number(hv.raw.toPrecision(4))}
        </div>
      )}
    </div>
  );
}

const foldKey = (id: string) => `neuromap:fold:${id}`;

/** An object's toolbar, standing on its top edge in 3D and turning with it; ◂ folds it down to that one button. */
export function FloatBar({ id, children }: { id: string; children: ReactNode }) {
  const [folded, setFolded] = useState(() => {
    try {
      return window.localStorage.getItem(foldKey(id)) === "1";
    } catch {
      return false;
    }
  });
  const fold = () => {
    setFolded(!folded);
    try {
      window.localStorage.setItem(foldKey(id), folded ? "0" : "1");
    } catch {
      // storage blocked: the fold lasts until reload
    }
  };
  useEffect(() => (bars.add(id), () => void bars.delete(id)), [id]);
  return createPortal(
    <div className="board-tools">
      <button title={folded ? "open the bar" : "fold the bar"} onClick={fold}>{folded ? "▸" : "◂"}</button>
      {!folded && children}
    </div>,
    elementFor(`bar:${id}`),
  );
}

const SPEEDS: [number, string][] = [[2400, "slow"], [1200, "normal"], [500, "fast"]];

/** A tied board's stack controls: which pairs carry overlay cards, and row playback. */
function TieTools({ board }: { board: string }) {
  const s = useStore();
  const pb = s.playback?.board === board ? s.playback : null;
  const rows = stackOf(board)?.rows ?? [];
  return (
    <>
      <span className="sep" />
      <select title="overlay CCG cards on the stack" value={s.stackCards} onChange={(e) => store.set({ stackCards: e.target.value as typeof s.stackCards })}>
        <option value="picked">cards: picked pair</option>
        <option value="all">cards: every pair</option>
      </select>
      <button title="previous row" onClick={() => stepRow(-1, board)}>◀</button>
      <button title={pb?.playing ? "pause" : "play the rows in order"} onClick={() => (pb?.playing ? pausePlayback() : playRows(board))}>{pb?.playing ? "⏸" : "▶"}</button>
      <button title="next row" onClick={() => stepRow(1, board)}>▶|</button>
      <button title="back on the stack's side wall, facing +x, right of its networks" onClick={() => tie(board, s.ties.find((t) => t.board === board)!.network)}>side wall</button>
      <button title="cut the cable: the test's networks go" onClick={() => untie(board)}>untie ✕</button>
      {pb && (
        <>
          <span className="play-row">{rows[pb.row]?.name ?? ""}</span>
          <select value={pb.ms} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}>
            {SPEEDS.map(([ms, label]) => <option key={ms} value={ms}>{label}</option>)}
          </select>
          <button title="stop: every row's curve alike again" onClick={stopPlayback}>■</button>
        </>
      )}
    </>
  );
}

/** Open the stats editor on this board's test, in the board's plane just left of it. */
function editBoard(b: Board): void {
  setActiveTest(b.id);
  const s = store.get();
  const panel = s.panels.find((p) => p.id === "stats")!;
  const a = anchors.get(b.id);
  const k = PANEL_PX * s.objectScale;
  const left = new Vector3(-1, 0, 0).applyQuaternion(new Quaternion(...b.pose.q));
  const down = new Vector3(0, -1, 0).applyQuaternion(new Quaternion(...b.pose.q));
  const at = (a?.at ?? new Vector3(...b.pose.p)).clone().addScaledVector(left, (panel.w * k) / 2 + 0.5).addScaledVector(down, (panel.h * k) / 2);
  openPanelAt("stats", { p: at.toArray() as Vec3, q: b.pose.q });
}
