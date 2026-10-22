// The stats editor: the one test it is linked to (its link dot, or a board's ⚙ edit), a new or saved test to open. Results draw as boards in 3D.
import { closeTest, newTest, openSaved } from "../../statsActions";
import { setView } from "../../actions";
import { useStore } from "../useStore";
import { StatsEditor } from "./StatsEditor";

export function StatsPanel() {
  const s = useStore();
  const { options, tests, active, saved } = s.stats;
  if (!options) return <div className="loading">loading stats options…</div>;
  const test = tests.find((t) => t.id === active);

  return (
    <div className="stats-panel">
      <div className="row tabs">
        {test && (
          <span className="tab on">
            <b>{test.name || "unsaved test"}</b>{test.status === "running" ? " …" : ""}
            <button className="linkish" title="close this test" onClick={() => closeTest(test.id)}>✕</button>
          </span>
        )}
        <button onClick={() => newTest()}>+ new test</button>
        <select value="" onChange={(e) => e.target.value && openSaved(e.target.value)}>
          <option value="">open saved…</option>
          {saved.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
        </select>
        {s.view !== "3d" && tests.some((t) => t.results.length) && <button className="linkish" onClick={() => setView("3d")}>see results in 3D</button>}
      </div>
      {test ? <StatsEditor key={test.id} test={test} options={options} /> : <div className="empty">Open a saved test or start a new one.</div>}
    </div>
  );
}
