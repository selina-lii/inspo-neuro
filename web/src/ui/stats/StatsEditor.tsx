// One stats test: how to test, the group rows, run and save, and the result text. Mirrors the Qt StatsTestPanel.
import { useMemo, useState } from "react";
import { lockColumn, lockedColumn, newRow, PICKER_ORDER, resolveFollows, type StatsOptions, type StatsTest, type TestConfig, type ViewConfig } from "../../core/stats";
import { pickFamily, runTest, saveTest, setRows, updateConfig } from "../../statsActions";
import { DisplayEditor } from "./DisplayEditor";
import { StatsRowEditor } from "./StatsRowEditor";

const TEST_FLAGS: [keyof TestConfig, string, string][] = [
  ["nonparametric", "nonparametric", ""],
  ["log_transform", "log-transform", ""],
  ["zscore", "zscore", "plot each pair from its first-row value, in its own SDs across rows"],
  ["remove_outliers", "remove outliers", "drop >3 SD pairs before testing"],
  ["post_hoc", "post hoc", "the ANOVA's pairwise post-hoc test"],
  ["greenhouse_geisser", "G-G", "Repeated-measures ANOVA: Greenhouse-Geisser sphericity correction. The test assumes the differences between every two rows have equal variance; when they do not, p comes out too small. G-G scales both df by ε (1 = no violation) and reports the corrected p. The result text always states ε and Mauchly's test, and whether p is corrected."],
];
const VIEW_FLAGS: [keyof ViewConfig, string][] = [["violin", "violin"], ["outliers", "show outliers"], ["sig_brackets", "sig. brackets"], ["show_n", "n in title"]];

export function StatsEditor({ test, options }: { test: StatsTest; options: StatsOptions }) {
  const { config } = test;
  const resolved = useMemo(() => resolveFollows(config.rows, options), [config.rows, options]);
  const [name, setName] = useState(test.name);
  const [showCs, setShowCs] = useState(false);
  const setTest = (patch: Partial<TestConfig>) => updateConfig(test.id, { test: { ...config.test, ...patch } });
  const setView = (patch: Partial<ViewConfig>) => updateConfig(test.id, { view: { ...config.view, ...patch } });
  const onRows = (rows: typeof config.rows) => setRows(test.id, rows);

  return (
    <div className="stats-editor">
      <div className="row">
        <select value={config.test.test_type ?? ""} onChange={(e) => setTest({ test_type: e.target.value || null })}>
          <option value="">infer test</option>
          {options.test_types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={config.test.sides} onChange={(e) => setTest({ sides: e.target.value })}>
          <option>Two-sided</option>
          <option>One-sided</option>
        </select>
        {config.test.sides === "One-sided" && (
          <button onClick={() => setTest({ direction: config.test.direction.trim() === "A > B" ? "A < B" : "A > B" })}>{config.test.direction}</button>
        )}
        {TEST_FLAGS.map(([k, label, tip]) => (
          <label key={k} title={tip}><input type="checkbox" checked={Boolean(config.test[k])} onChange={(e) => setTest({ [k]: e.target.checked })} />{label}</label>
        ))}
        <select title="multiple-comparison correction of the post-hoc p-values (Tukey's HSD corrects its own)" value={config.test.p_adjust ?? "Bonferroni"}
          onChange={(e) => setTest({ p_adjust: e.target.value })}>
          {options.p_adjust.map((m) => <option key={m}>{m}</option>)}
        </select>
        <span className="sep" />
        <label title="test this many randomly sampled pairs (the same pairs in every row of a matched test); each run draws a new sample">
          thin <input type="number" min={0} className="num-input" value={config.test.thin} onChange={(e) => setTest({ thin: Math.max(0, Number(e.target.value)) })} />
        </label>
      </div>

      <div className="stats-rows">
        <div className="stats-row head">
          <div className="cell name">group row</div>
          {PICKER_ORDER.map((k) => (
            <div className="cell" key={k}>
              {options.pickers[k].label}
              <button className={`follow${lockedColumn(config.rows, k) ? " on" : ""}`} title="lock: every row shares the top row's value"
                onClick={() => onRows(lockColumn(config.rows, k, !lockedColumn(config.rows, k)))}>🔒</button>
            </div>
          ))}
          <span />
        </div>
        {config.rows.map((r, i) => (
          <StatsRowEditor key={r.id} rows={config.rows} resolved={resolved} index={i} options={options} onRows={onRows} onFamily={(at, f) => pickFamily(test.id, at, f)} />
        ))}
        <div className="row">
          <button onClick={() => onRows([...config.rows, newRow(config.rows, options, config.rows[config.rows.length - 1])])}>+ add group</button>
          <button className="linkish" onClick={() => setShowCs(!showCs)}>{showCs ? "▾" : "▸"} CS settings</button>
        </div>
        {showCs && <DisplayEditor display={config.display} defaults={options.defaults.display} onChange={(display) => updateConfig(test.id, { display })} />}
      </div>

      <div className="row">
        {VIEW_FLAGS.map(([k, label]) => (
          <label key={k}><input type="checkbox" checked={Boolean(config.view[k])} onChange={(e) => setView({ [k]: e.target.checked })} />{label}</label>
        ))}
        <span className="grow" />
        <button className="primary" disabled={test.status === "running"} onClick={() => runTest(test.id)}>{test.status === "running" ? "running…" : "run"}</button>
        <input placeholder="name to save as" value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={!test.job || !name.trim()} title={test.job ? "" : "run first: a save stores this run's result"} onClick={() => saveTest(test.id, name.trim())}>save</button>
      </div>
      {test.error && <div className="stats-error">{test.error}</div>}
      {test.warnings.map((w) => <div className="stats-warning" key={w}>{w}</div>)}
      {test.text && <pre className="stats-text">{test.text}</pre>}
    </div>
  );
}
