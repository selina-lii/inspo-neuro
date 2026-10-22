// One group row: colour, name, the pickers, and per picker whether it follows the row above.
import { followedPickers, lockedColumn, PICKER_ORDER, type ListPickerKey, type PickerKey, type RowConfig, type StatsOptions } from "../../core/stats";
import { ListPicker } from "./ListPicker";
import { RulesPicker } from "./RulesPicker";

type Props = {
  rows: RowConfig[];
  resolved: RowConfig[];   // the same rows with followed fields filled in from above
  index: number;
  options: StatsOptions;
  onRows(rows: RowConfig[]): void;
  onFamily(index: number, family: string): void;
};

export function StatsRowEditor({ rows, resolved, index, options, onRows, onFamily }: Props) {
  const row = rows[index]!;
  const shown = resolved[index]!;
  const follows = new Set(followedPickers(row));
  const lockedCols = new Set(PICKER_ORDER.filter((k) => lockedColumn(rows, k)));
  const put = (patch: Partial<RowConfig>) => onRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const toggleFollow = (k: PickerKey) => {
    const next = new Set(follows);
    if (!next.delete(k)) next.add(k);
    put({ follow: next.size ? rows[index - 1]!.id : null, follow_pickers: PICKER_ORDER.filter((x) => next.has(x)), follow_exclude: false });
  };
  const display = (v: string) => options.display[v] ?? v;

  const cell = (k: PickerKey) => {
    // a grid sets a fed row's pairs: its sessions, types, segment and rules
    if (row.fed && k !== "res" && k !== "data") {
      return <div className="cell muted" key={k} title="set by the CCG grid feeding this row">{k === "seg" ? row.segments.join(", ") : k === "sess" ? `${row.pairs?.length ?? 0} grid pairs` : "from grid"}</div>;
    }
    const locked = follows.has(k);
    // a locked column draws as one block down every row, as the Qt panel does: the rows below show no picker of their own
    if (lockedCols.has(k) && index > 0) {
      return <div className={`cell lockblock${index === rows.length - 1 ? " last" : ""}`} key={k} title="locked: every row shares the top row's value" />;
    }
    if (lockedCols.has(k)) return <div className="cell lockhead" key={k}>{cellBody(k, locked, false)}</div>;
    return <div className="cell" key={k}>{cellBody(k, locked, index > 0)}</div>;
  };

  const cellBody = (k: PickerKey, locked: boolean, followable: boolean) => {
    const follow = followable && (
      <button className={`follow${locked ? " on" : ""}`} title={locked ? "follows the row above: click to set its own" : "follow the row above"} onClick={() => toggleFollow(k)}>↑</button>
    );
    if (k === "grp") return <>{follow}<RulesPicker rules={shown.rules} options={options} locked={locked} onChange={(rules) => put({ rules })} /></>;
    if (k === "data") {
      return (
        <>{follow}
          <ListPicker plural="metrics" single items={options.pickers.data.items} disabled={options.disabled_metrics} locked={locked}
            selected={shown.data_type ? [shown.data_type] : []} onChange={([v]) => put({ data_type: v ?? "" })} />
        </>
      );
    }
    const field = options.pickers[k].field as "sessions" | "conn_types" | "segments" | "resolution";
    const onChange = (next: string[]) => {
      const family = next.find((x) => x.startsWith(options.family_prefix) && !shown[field].includes(x));
      if (k === "seg" && family) return onFamily(index, family.slice(options.family_prefix.length));
      put({ [field]: next });
    };
    return (
      <>{follow}
        <ListPicker plural={options.pickers[k as ListPickerKey].plural} items={options.pickers[k].items} selected={shown[field]} locked={locked} display={display}
          empty={k === "seg" ? "whole session" : undefined} onChange={onChange} />
      </>
    );
  };

  return (
    <div className="stats-row">
      <div className="cell name">
        <input type="color" value={row.color || "#8fb3ff"} onChange={(e) => put({ color: e.target.value })} />
        <input value={row.name} onChange={(e) => put({ name: e.target.value })} />
      </div>
      {PICKER_ORDER.map(cell)}
      <button className="linkish" title="remove this row" onClick={() => onRows(rows.filter((_, i) => i !== index).map((r) => (r.follow === row.id ? { ...r, follow: null } : r)))}>✕</button>
    </div>
  );
}
