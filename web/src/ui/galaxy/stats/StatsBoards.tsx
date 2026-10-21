// Every open test's result board, in the network's 3D space.
import { useEffect, useMemo, useRef } from "react";
import { pairHidden } from "../../../core/derive";
import type { Vec3 } from "../../../core/stats";
import { noteScene } from "../../../statsActions";
import { useStore } from "../../useStore";
import { ResultBoard } from "./ResultBoard";

export function StatsBoards({ center, extent, height, dark, onAdded }: { center: Vec3; extent: number; height: number; dark: boolean; onAdded(): void }) {
  const s = useStore();
  const { boards, tests, values, pick, active } = s.stats;
  useEffect(() => noteScene(center, extent, height), [center, extent, height]);
  // values whose pair the network's filters hide: drawn grey on every board
  const grayed = useMemo(() => new Set(Object.entries(values).filter(([, v]) => {
    const neurons = v.session === s.session ? s.neurons : s.stack[v.session]?.neurons;
    return neurons && pairHidden(s.filters, neurons, v.ref, v.tgt);
  }).map(([id]) => id)), [values, s.filters, s.session, s.neurons, s.stack]);
  const count = useRef(boards.length);
  // a new board opens beside the network: bring both into view
  useEffect(() => {
    if (boards.length > count.current) window.setTimeout(onAdded, 100);
    count.current = boards.length;
  }, [boards.length]);
  return (
    <>
      {boards.map((b) => {
        const test = tests.find((t) => t.id === b.id);
        return test?.results.length ? <ResultBoard key={b.id} board={b} test={test} values={values} grayed={grayed} pick={pick} dark={dark} active={active === b.id} objectScale={s.objectScale} playRow={s.playback?.board === b.id ? s.playback.row : null} /> : null;
      })}
    </>
  );
}
