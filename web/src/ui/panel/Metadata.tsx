// What is open and how much of it shows: the project, session and segment, the links passing the filters, fit progress.
import { openPanel, patchPanel, setMainHidden } from "../../actions";
import { visibleLinks } from "../../core/derive";
import { nodePairs } from "../../core/grid";
import { activeSegment, type Picked3 } from "../../core/store";
import { patchGrid, patchNode, patchStyle, removeNode, removeStyle } from "../../gridActions";
import { pick3, remove3 } from "../../stackActions";
import { PANEL_TITLES } from "../map/SpacePanelNode";
import { useStore } from "../useStore";

export function MetadataBody() {
  const s = useStore();
  const shown = visibleLinks(s.links, s.filters, s.neurons).length;
  const rows: [string, string][] = [
    ["project", s.project ?? "–"],
    ["session", s.session ?? "–"],
    ["segment", activeSegment(s)],
    ["neurons", String(s.neurons.length)],
    ["links shown", `${shown} of ${s.links.length} (the filters)`],
    ["peak fits", s.fitProgress ? `${s.fitProgress.done} of ${s.fitProgress.total}${s.fitProgress.running ? " (running)" : ""}` : "–"],
    ["unsaved edits", String(s.unsaved)],
  ];
  return (
    <>
      <table className="metadata">
        <tbody>{rows.map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}</tbody>
      </table>
      <Objects />
    </>
  );
}

/** Everything the workspace holds, shown or not: find a stray, bring it back, or remove it. */
function Objects() {
  const s = useStore();
  const testName = (id: string) => s.stats.tests.find((t) => t.id === id)?.name || "unsaved test";
  const row = (key: string, label: string, state: string, actions: [string, () => void][]) => (
    <tr key={key}><td>{label}</td><td className="muted">{state}</td><td>{actions.map(([name, f]) => <button key={name} className="chip plain" onClick={f}>{name}</button>)}</td></tr>
  );
  // in front of the camera, wherever it had gone
  const here = (f: () => void): [string, () => void] => ["bring here", f];
  const objects = (p: Picked3): [string, () => void][] => [["select", () => pick3(p.kind, p.id)], ["remove", () => remove3(p)]];
  return (
    <table className="metadata">
      <thead><tr><th colSpan={3} className="muted">in this workspace</th></tr></thead>
      <tbody>
        {row("net:main", `network · ${s.session ?? "–"}`, s.mainHidden ? "hidden" : "shown", s.mainHidden ? [["show", () => setMainHidden(false)]] : [["select", () => pick3("network", "main")], ["hide", () => setMainHidden(true)]])}
        {s.networks.map((n) => row(`net:${n.id}`, `network · ${n.segment}`, "copy", objects({ kind: "network", id: n.id })))}
        {s.stats.boards.map((b) => row(`board:${b.id}`, `stats · ${testName(b.id)}`, s.ties.some((t) => t.board === b.id) ? "tied" : "", objects({ kind: "board", id: b.id })))}
        {s.grids.map((g) => row(`grid:${g.id}`, `CCG grid · ${g.source ?? "not cabled"}`, "", [here(() => patchGrid(g.id, { summon: true })), ...objects({ kind: "grid", id: g.id })]))}
        {s.pairNodes.map((n) => row(`node:${n.id}`, "pair filter", `${nodePairs(s, n).length} pairs`, [here(() => patchNode(n.id, { summon: true })), ["remove", () => removeNode(n.id)]]))}
        {s.styleNodes.map((n) => row(`style:${n.id}`, "curve style", `${n.curves.length} styled`, [here(() => patchStyle(n.id, { summon: true })), ["remove", () => removeStyle(n.id)]]))}
        {s.panels.map((p) => row(`panel:${p.id}`, PANEL_TITLES[p.kind], p.closed ? "closed" : p.collapsed ? "collapsed" : "open",
          p.closed ? [["open", () => openPanel(p.id)]] : [here(() => patchPanel(p.id, { summon: true })), ...objects({ kind: "panel", id: p.id }).map(([n, f]): [string, () => void] => [n === "remove" ? "close" : n, f])]))}
      </tbody>
    </table>
  );
}
