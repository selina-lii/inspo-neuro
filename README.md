# neuromap

Neurons as cards in physical (or embedded) space, pairs as links. A React front end over a thin Python API that reads and writes through NeuroPy's SD/CD; nothing in NeuroPy is changed.

## Run

```sh
./run_server.sh                  # Python API on :8765 (NEUROPY_ROOT defaults to ../NeuroPy)
cd web && npm install && npm run dev   # http://localhost:5174
```

## Layout

- `server/views.py` — pure builders: neuron table, pair links, CCG traces, peak fits, embedding.
- `server/app.py` — FastAPI routes; one open project; tag writes go through `sd.groups` / `sd.neuron_groups`.
- `web/src/core` — store and derivations (no React); `web/src/io/api.ts` — the only module that knows URLs;
  `web/src/ui/map` — React Flow for neurons (dots, cards where they fit) and areas; links on a canvas under it, redrawn
  on React Flow's viewport without a React render; `web/src/ui/panel` — detail panel, CCG plot, tag bar.
- `state/<project>/` — this app's own files: manual layouts, areas, and the backup taken before the first tag write of each server run.

## What it shows

- Neurons as dots (cards where they fit) in physical, embedding, axes or manual layouts; pairs as curved arrows.
- Several maps side by side in one space, each for its own segment; the active map drives the CCG plot.
- Panels in the space: selection & details, and the time slider (segments on the session timeline, stepping a family).
- Colour neurons by region, firing rate in a segment, rate ratio, tag label or value, or place cell; colour links by type,
  strength in the map's segment, strength change between two segments, or on/off between two segments. What dashes and
  widths stand for is chosen in the top bar.
- CCG plot with the Qt panel's options: lo/hi res, baseline, ACG ref/tgt, ref waveform, peak fit (click a peak to call it),
  test window, line, p / corrected p, normalisations, jitter.
- 3D: the same colours, probes per shank (hover to fan a shank's neurons out, click to keep them out), xyz gizmo.

## Ports

`NEUROMAP_API_PORT` (8765) and `NEUROMAP_WEB_PORT` (5174) move the two servers; `NEUROMAP_STATE` moves this app's own files.

## Writes

Tag, pair-state and peak-call writes are refused while the Qt GUI (`run_ccg_gui.py`) is open: both would write the same
selection files. The first write of each server run backs those files up under `state/<project>/backups/`.
