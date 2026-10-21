// The CS settings a test computes under (NeuroPy's DisplayConfig): a field per setting, typed by its default.
import { useState } from "react";

type Value = unknown;

function Field({ name, value, onChange }: { name: string; value: Value; onChange(v: Value): void }) {
  const [text, setText] = useState(JSON.stringify(value));
  const [bad, setBad] = useState(false);
  if (typeof value === "boolean") {
    return <label className="dfield"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />{name}</label>;
  }
  if (typeof value === "string") {
    return <label className="dfield">{name}<input value={value} onChange={(e) => onChange(e.target.value)} /></label>;
  }
  if (typeof value === "number") {
    return <label className="dfield">{name}<input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
  }
  // lists and nulls: edited as JSON, applied once they parse
  return (
    <label className="dfield">{name}
      <input className={bad ? "bad" : ""} value={text} onChange={(e) => {
        setText(e.target.value);
        try {
          onChange(JSON.parse(e.target.value));
          setBad(false);
        } catch {
          setBad(true);
        }
      }} />
    </label>
  );
}

export function DisplayEditor({ display, defaults, onChange }: { display: Record<string, Value> | null; defaults: Record<string, Value>; onChange(d: Record<string, Value>): void }) {
  const current = { ...defaults, ...(display ?? {}) };
  return (
    <div className="display-editor">
      {Object.entries(current).filter(([k]) => !k.startsWith("show_") && k !== "same_scale_mode").map(([k, v]) => (
        <Field key={k} name={k} value={v} onChange={(next) => onChange({ ...current, [k]: next })} />
      ))}
    </div>
  );
}
