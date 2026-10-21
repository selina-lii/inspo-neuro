// The start screen: pick a project; it opens on an empty workspace at its first session.
import { openProject } from "../actions";
import { store } from "../core/store";
import { useStore } from "./useStore";

export function ProjectPicker() {
  const s = useStore();
  return (
    <div className="splash">
      <div className="picker">
        <div className="menu-sec-title">open a project</div>
        {s.projects.map((p) => <button key={p} className="chip plain" onClick={() => (store.set({ picker: false }), openProject(p))}>{p}</button>)}
        {s.project && <button onClick={() => store.set({ picker: false })}>cancel</button>}
      </div>
    </div>
  );
}
