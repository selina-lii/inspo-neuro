// What is open and how much of it shows: the project, session and segment, the links passing the filters, fit progress.
import { visibleLinks } from "../../core/derive";
import { activeSegment } from "../../core/store";
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
    <table className="metadata">
      <tbody>{rows.map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}</tbody>
    </table>
  );
}
