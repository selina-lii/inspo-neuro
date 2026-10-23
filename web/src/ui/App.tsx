import { lazy, Suspense, useEffect, useState } from "react";
import { boot, clearHighlight, fail, movePairs, saveEdits, stepFocus, targetPairs, toggleGroup } from "../actions";
import { refreshSaved } from "../statsActions";
import { store } from "../core/store";
import { deletePicked, settleTies } from "../stackActions";
import { redo, undo } from "../history";
import { MapBoundary } from "./map/MapBoundary";
import { MapView } from "./map/MapView";
import { MenuBar } from "./menu/MenuBar";
import { ProjectPicker } from "./ProjectPicker";
import { useStore } from "./useStore";
import { useLoading } from "../io/loading";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

// three.js is most of the bundle: the 3D view loads the first time it is opened
const GalaxyView = lazy(() => import("./galaxy/GalaxyView").then((m) => ({ default: m.GalaxyView })));

export function App() {
  const s = useStore();
  const [dark, setDark] = useState(darkQuery.matches);
  useEffect(() => {
    boot();
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    darkQuery.addEventListener("change", onChange);
    return () => darkQuery.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    // back from the Qt viewer: saved tests it rewrote read again
    const onFocus = () => void refreshSaved().catch(fail);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  useEffect(() => {
    // edits live on the server until saved; leaving the page does not lose them, but the reminder is cheap
    const onLeave = (e: BeforeUnloadEvent) => store.get().unsaved && e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);
  useEffect(() => {
    // a trackpad pinch arrives as ctrl+wheel: over a toolbar it would zoom the whole page, blurring it and hiding the menu bar
    const onWheel = (e: WheelEvent) => e.ctrlKey && e.preventDefault();
    // the page and its fixed layers never scroll (a focus or scroll into view would move the menu bar and the 3D panels away);
    // only boxes with their own scrollbar do
    const onScroll = (e: Event) => {
      const el = e.target === document ? document.scrollingElement! : (e.target as HTMLElement);
      if (el !== document.scrollingElement && /auto|scroll/.test(getComputedStyle(el).overflow)) return;
      el.scrollTop = 0;
      el.scrollLeft = 0;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("scroll", onScroll, true);
    return () => (window.removeEventListener("wheel", onWheel), document.removeEventListener("scroll", onScroll, true));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") return e.preventDefault(), saveEdits();
      if (target.closest("input, select, textarea")) return;
      // the space's arrangement; text fields keep their own undo
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "z" || e.key === "y")) return e.preventDefault(), e.shiftKey || e.key === "y" ? redo() : undo();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const st = store.get();
      if (e.key === "ArrowDown" || e.key === "j") return e.preventDefault(), stepFocus(1);
      if (e.key === "ArrowUp" || e.key === "k") return e.preventDefault(), stepFocus(-1);
      // whatever is selected in 3D: Delete removes it
      if ((e.key === "Delete" || e.key === "Backspace") && st.picked3) return e.preventDefault(), deletePicked();
      if (e.key === "Escape") return settleTies(), store.set({ picked3: null, more3: [], gizmo: false }), clearHighlight();
      // G: the selection's move and turn gizmo, on or off
      if (e.key === "g" && st.picked3) return store.set({ gizmo: !st.gizmo });
      const pairs = targetPairs();
      const states = { S: "sel", U: "unsel", D: "del" } as const;
      if (e.shiftKey && e.key in states && pairs.size) return movePairs(pairs, states[e.key as keyof typeof states]);
      const group = Object.entries(st.groupMeta).find(([, m]) => m.hotkey && m.hotkey === e.key)?.[0];
      if (group) {
        e.preventDefault();
        toggleGroup(group);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!s.toast) return;
    const timer = window.setTimeout(() => store.set({ toast: null }), 8000);
    return () => window.clearTimeout(timer);
  }, [s.toast]);

  return (
    <div className="app">
      <MenuBar />
      <main>
        {s.picker || (!s.project && !s.busy) ? (
          <ProjectPicker />
        ) : s.project ? (
          <MapBoundary session={`${s.session}:${s.view}`}>
            {s.view === "3d" ? (
              <Suspense fallback={<div className="splash">loading 3D…</div>}>
                <GalaxyView dark={dark} />
              </Suspense>
            ) : (
              <MapView dark={dark} />
            )}
          </MapBoundary>
        ) : (
          <div className="splash">{s.busy}</div>
        )}
      </main>
      {s.busy && s.project && <div className="busy">{s.busy}</div>}
      <div className="toasts">
        <Loading />
        {s.error && (
          <div className="toast error" onClick={() => store.set({ error: null })}>
            {s.error}
          </div>
        )}
        {s.toast && (
          <div className="toast">
            {s.toast.text}
            {s.toast.undo && <button onClick={s.toast.undo}>undo</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// its own component: a request opening or closing re-renders this line alone
function Loading() {
  const open = useLoading();
  return open.length > 0 ? <div className="toast loading">loading {[...new Set(open)].join(", ")}…</div> : null;
}
