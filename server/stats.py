"""Stats-test routes: the web editor drives StatsTestBackend exactly as the Qt panel does."""
import itertools
import shutil
import threading
import time

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from neuropy.ui.app_state import DisplayConfig
from neuropy.ui.stats_tests_backend import StatsTestBackend

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


class SaveRequest(BaseModel):
    name: str
    job: int


def _backend(p, display: dict | None) -> StatsTestBackend:
    dc = DisplayConfig()
    if display:
        dc.__setstate__(display)
    return StatsTestBackend(p.cd, p.sd, display=dc)


def _config(b: StatsTestBackend) -> dict:
    return dict(b.to_dict(), display=b.display.serialize())


@router.get('/options')
def options():
    p = project()
    with p.lock:
        return stats_views.options(_backend(p, None))


@router.get('/saved')
def saved():
    p = project()
    return dict(saved=[dict(name=name, saved_at=at) for name, _, at, *_ in _backend(p, None).saved_results()])


@router.get('/saved/{name}')
def load(name: str):
    p = project()
    with p.lock:
        b = _backend(p, None)
        d = b.load(str(b.save_dir / f'{name}.json'))
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
        job['error'] = f'{type(exc).__name__}: {exc}'
    finally:
        p.release_others()


@router.post('/run')
def run(cfg: StatsConfig):
    p = project()
    b = _backend(p, cfg.display)
    b.from_dict(dict(rows=cfg.rows, test=cfg.test, view=cfg.view))
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
        b.save(req.name, display=b.display.serialize())
    return dict(ok=True, name=req.name)
