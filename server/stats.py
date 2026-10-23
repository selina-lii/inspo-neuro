"""Stats-test routes: the web editor drives StatsTestBackend exactly as the Qt panel does."""
import itertools
import shutil
import threading
import traceback
import time
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from neuropy.analyses.pair_selection_data import DerivedRule
from neuropy.analyses.utils import _SPECIAL_PREFIX
from neuropy.ui.app_state import DisplayConfig
from neuropy.ui.stats_tests_backend import METRICS, RowConfig, StatsTestBackend

from server import stats_views
from server.project import STATE_DIR, project, writable

router = APIRouter(prefix='/api/stats')
jobs: dict = {}   # job id -> {'backend', 'thread', 'payload', 'error'}
job_ids = itertools.count(1)
KEEP_JOBS = 8   # a job's backend stays for saving; older ones go


class StatsConfig(BaseModel):
    rows: list
    test: dict
    view: dict = {}
    display: dict | None = None   # the CS settings a loaded test ran under; None = defaults


class SeriesRequest(BaseModel):
    curves: list   # [{label, segments}]: one value per pair each, measured as a stats row would
    pairs: list
    metric: str
    resolution: str
    display: dict | None = None   # the linked test's CS settings; None = defaults


class SaveRequest(BaseModel):
    name: str
    job: int


class PairsBackend(StatsTestBackend):
    """Rows fed by a CCG grid draw from its pairs alone."""

    def __init__(self, *args, home: Path, **kw):
        super().__init__(*args, **kw)
        self.home = home
        self.row_pairs: dict = {}   # row id -> {(session, ref, tgt)}
        self._only = None

    @property
    def save_dir(self) -> Path:
        # the web's saves stay out of the Qt GUI's stats results
        d = self.home / 'stats_results'
        d.mkdir(parents=True, exist_ok=True)
        return d

    def collect_row(self, cfg, resolution: str) -> dict:
        self._only = self.row_pairs.get(cfg.id)
        try:
            return super().collect_row(cfg, resolution)
        finally:
            self._only = None

    def pairs_for_rules(self, rules: list, ptr_key) -> set:
        out = super().pairs_for_rules(rules, ptr_key)
        if self._only is None:
            return out
        s = str(ptr_key.session)
        return {q for q in out if (s, int(q[0]), int(q[1])) in self._only}


def _backend(p, display: dict | None) -> PairsBackend:
    dc = DisplayConfig()
    if display:
        dc.__setstate__(display)
    return PairsBackend(p.cd, p.sd, display=dc, home=STATE_DIR / p.name)


def _pair_keys(keys: list) -> set:
    return {(sess, int(r), int(t)) for sess, r, t in (k.split('|') for k in keys)}


def _tag_fed_rows(p, b: PairsBackend, name: str) -> None:
    """A grid-fed row's pairs become a hidden pair tag it is ruled by, so Qt reproduces the row."""
    groups = p.sd.groups
    for row in b.rows:
        if row.id not in b.row_pairs:
            continue
        tag = f'{_SPECIAL_PREFIX}grid · {name} · {row.name}'
        if tag in groups.defined_groups:
            groups.delete_group(tag)
        groups.create_group(tag)
        for sess, ref, tgt in b.row_pairs[row.id]:
            groups.add_to_group(tag, sess, (ref, tgt))
            p.drop(sess)
        row.rules = [r for r in row.rules if tag not in r.values] + [DerivedRule(kind=DerivedRule.PAIR_TAG, values=[tag])]
    # the session files are what Qt reads tags from, not the groups file: a full save, which takes pending edits too
    p.sd.save()
    p.unsaved = 0


def _config(b: StatsTestBackend) -> dict:
    return dict(b.to_dict(), display=b.display.serialize())


@router.get('/options')
def options():
    p = project()
    with p.lock:
        return stats_views.options(_backend(p, None))


def _saved_files(b: PairsBackend) -> dict:
    # by name: the Qt viewer's saves too, the web's own shadowing one of the same name
    qt = Path(b.cd.stats_results_dir)
    return {f.stem: f for d in (qt, b.save_dir) if d.is_dir() for f in sorted(d.glob('*.json'))}


@router.get('/saved')
def saved():
    files = _saved_files(_backend(project(), None))
    return dict(saved=[dict(name=name, saved_at=str(f.stat().st_mtime_ns)) for name, f in files.items()])


@router.get('/saved/{name}')
def load(name: str):
    p = project()
    with p.lock:
        b = _backend(p, None)
        f = _saved_files(b).get(name)
        if f is None:
            raise HTTPException(404, f'no saved stats test {name!r}')
        d = b.load(str(f))
        if d.get('display'):
            b.display.__setstate__(d['display'])
        return dict(name=name, config=_config(b), **stats_views.result_payload(b, b.results))


def _run(p, job: dict):
    b = job['backend']
    try:
        with p.lock:
            b.run()
            job['payload'] = stats_views.result_payload(b, b.results)
    except Exception as exc:
        traceback.print_exc()   # the job carries one line; the console keeps where it came from
        job['error'] = f'{type(exc).__name__}: {exc}'
    finally:
        p.release_others()


@router.post('/run')
def run(cfg: StatsConfig):
    p = project()
    b = _backend(p, cfg.display)
    b.from_dict(dict(rows=[{k: v for k, v in r.items() if k not in ('pairs', 'fed', 'curve')} for r in cfg.rows], test=cfg.test, view=cfg.view))
    b.row_pairs = {r['id']: _pair_keys(r['pairs']) for r in cfg.rows if 'pairs' in r}
    b.test_config.thin_seed = int(np.random.default_rng().integers(1 << 31))   # each run draws a new sample
    if (err := b.validate()):
        raise HTTPException(400, err)
    job_id = next(job_ids)
    jobs[job_id] = job = dict(backend=b, payload=None, error=None)
    job['thread'] = threading.Thread(target=_run, args=(p, job), daemon=True)
    job['thread'].start()
    for old in sorted(jobs)[:-KEEP_JOBS]:
        jobs.pop(old)
    return dict(job=job_id)


@router.get('/run/{job_id}')
def run_status(job_id: int):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, f'no stats job {job_id}')
    if job['error']:
        return dict(status='error', error=job['error'])
    if job['payload'] is None:
        return dict(status='running')
    return dict(status='done', config=_config(job['backend']), **job['payload'])


@router.post('/series')
def series(req: SeriesRequest):
    """``{curve label: {"session|ref|tgt": value}}``: each pair's value per curve, for a grid's stats view."""
    p = project()
    b = _backend(p, req.display)
    keys = _pair_keys(req.pairs)
    sessions = sorted({sess for sess, _, _ in keys})
    # a firing-rate metric keys each neuron by its self-pair
    side = {'ref_firing_rate': 0, 'tgt_firing_rate': 1}.get(METRICS[req.metric].source)
    b.row_pairs = {1: keys}
    out = {}
    for c in req.curves:
        row = RowConfig(id=1, name=c['label'], sessions=sessions, conn_types=list(b.available_conn_types()),
                        segments=list(c['segments']), resolution=[req.resolution], data_type=req.metric)
        with p.lock:
            try:
                g = b.collect_row(row, req.resolution)
            finally:
                p.release_others()
        got = {(str(k.session), int(k.ref), int(k.tgt)): v for k, v in zip(g['pairs'], g['vals'])}
        out[c['label']] = {f'{sess}|{r}|{t}': got.get((sess, r, t) if side is None else (sess, (r, t)[side], (r, t)[side]))
                           for sess, r, t in keys}
    return stats_views._clean(out)


@router.post('/save')
def save(req: SaveRequest):
    p = project()
    job = jobs.get(req.job)
    if not job or job['payload'] is None:
        raise HTTPException(404, f'stats job {req.job} has no result to save')
    with p.lock:
        writable(p)
        b = job['backend']
        path = b.save_dir / f'{req.name}.json'
        if path.exists():   # an overwrite keeps the old file
            dest = STATE_DIR / p.name / 'backups' / 'stats_results' / time.strftime('%Y%m%d_%H%M%S')
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest / path.name)
        _tag_fed_rows(p, b, req.name)
        b.save(req.name, display=b.display.serialize())
    return dict(ok=True, name=req.name)
