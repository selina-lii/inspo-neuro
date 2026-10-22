"""FastAPI over one open NeuroPy project; SD/CD stay the only owners of data and IO."""
import base64
import json
import multiprocessing as mp
import queue as queue_mod
import threading
import time
from pathlib import Path

import numpy as np

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from neuropy.analyses.ms_connectivity import projects_on_disk
from neuropy.analyses._jitter_worker import jitter_worker
from neuropy.analyses.ccg_transforms import NormalizeBy
from neuropy.analyses.neurons_dataset import Key
from neuropy.analyses.utils import is_special_group

from server import views
from server.project import Project, state_json, update_state_json, writable, project, state
from server.pick import router as pick_router
from server.stack import router as stack_router
from server.stats import router as stats_router
from server.workspaces import router as workspaces_router

app = FastAPI(title='neuromap')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])
app.include_router(stats_router)
app.include_router(stack_router)
app.include_router(pick_router)
app.include_router(workspaces_router)


@app.get('/api/projects')
def projects():
    return dict(projects=projects_on_disk(), open=state['p'].name if 'p' in state else None)


@app.post('/api/open/{name}')
def open_(name: str, discard: bool = False):
    if 'p' in state and state['p'].unsaved and not discard:
        raise HTTPException(409, f"{state['p'].unsaved} unsaved edit(s) in {state['p'].name}: save them first, or open again to discard them.")
    old = state.pop('p', None)
    if old is not None:   # its fit thread must stop before another project loads
        old.fit_session = None
        for job in old.fit_jobs.values():
            job.join()
    state['p'] = Project(name)
    return dict(name=name, sessions=sorted(map(str, state['p'].cd.sessions)))


@app.get('/api/sessions')
def sessions():
    p = project()
    meta = {name: dict(hotkey=g.hotkey, color=getattr(g, 'ui_color', ''), notes=g.notes) for name, g in p.sd.groups.registry.items()}
    return dict(name=p.name, sessions=sorted(map(str, p.cd.sessions)), group_meta=meta,
                pair_groups=sorted(p.sd.groups.registry), neuron_groups=sorted(p.sd.neuron_groups.registry))


@app.get('/api/session/{session}')
def session(session: str):
    p = project()
    p.focus_session(session)
    return _session_data(p, session)


def _session_data(p, session: str) -> dict:
    neurons = p.cached(('neurons', session), lambda: views.neuron_table(p.nd, p.cd, p.sd, session))
    links = p.cached(('links', session), lambda: views.pair_links(p.cd, p.sd, session))
    fits = p.fits.get(session, {})
    for l in links:
        l['fit'] = fits.get((l['ref'], l['tgt']))
    return dict(neurons=neurons, links=links, shanks=p.cached(('shanks', session), lambda: views.shanks(p.nd, p.cd, session)))


@app.get('/api/layout/{session}/{kind}')
def layout(session: str, kind: str, seed: int = 0, dims: int = 2):
    p = project()
    if kind == 'embedding':
        neurons = p.cached(('neurons', session), lambda: views.neuron_table(p.nd, p.cd, p.sd, session))
        links = p.cached(('links', session), lambda: views.pair_links(p.cd, p.sd, session))
        xy = p.cached(('embedding', session, seed, dims), lambda: views.embedding(p.cd, neurons, links, session, seed, dims))
        return dict(xy=xy.round(3).tolist())
    if kind == 'manual':
        path = state_json(p, 'manual_layout')
        return dict(xy=json.loads(path.read_text()).get(session) if path.exists() else None)
    raise HTTPException(404, kind)


class ManualLayout(BaseModel):
    xy: list


@app.put('/api/layout/{session}/manual')
def save_manual(session: str, body: ManualLayout):
    _write_session_json(project(), 'manual_layout', session, body.xy)
    return dict(ok=True)


def _write_session_json(p: Project, name: str, session: str, value) -> None:
    """One per-project JSON in this app's state dir, keyed by session; written atomically."""
    update_state_json(p, name, lambda saved: {**(saved or {}), session: value})


class Areas(BaseModel):
    areas: list


@app.get('/api/areas/{session}')
def areas(session: str):
    path = state_json(project(), 'areas')
    return dict(areas=json.loads(path.read_text()).get(session, []) if path.exists() else [])


@app.put('/api/areas/{session}')
def save_areas(session: str, body: Areas):
    _write_session_json(project(), 'areas', session, body.areas)
    return dict(ok=True)


def _fit_all(p: Project, session: str, pairs: list):
    out = p.fits.setdefault(session, {})
    for ref, tgt in pairs:
        if p.fit_session != session:
            return
        with p.lock:
            detail = _fit_detail(p, session, ref, tgt)
        out[(ref, tgt)] = {k: v for k, v in detail.items() if k not in ('lags', 'curve', 'peaks')}
        time.sleep(0.02)   # a released lock goes straight back to this loop unless it pauses: requests waiting on it go first


def _fit_detail(p: Project, session: str, ref: int, tgt: int, segment: str = 'all') -> dict:
    if (session, ref, tgt, segment) not in p.fit_details:
        key = views.key_for_pair(p.cd, session, ref, tgt)
        p.fit_details[(session, ref, tgt, segment)] = views.fit_detail(views.pair_fit(p.cd, p.sd, key, ref, tgt, segment))
    return p.fit_details[(session, ref, tgt, segment)]


def _traces(session: str, segment: str) -> tuple:
    p = project()
    return p.cached(('traces', session, segment), lambda: views.session_traces(p.cd, session, segment))


@app.get('/api/traces/{session}')
def traces(session: str, segment: str = 'all'):
    return _traces(session, segment)[0]


@app.get('/api/traces/{session}/{res}.bin')
def traces_bin(session: str, res: str, segment: str = 'all'):
    """Raw little-endian float32 rows, read straight into a Float32Array."""
    return Response(_traces(session, segment)[1][res], media_type='application/octet-stream')


@app.get('/api/fit/{session}/{ref}/{tgt}')
def fit(session: str, ref: int, tgt: int, segment: str = 'all'):
    p = project()
    if not any((ref, tgt) in p.cd.ptr[k].pair_set for k in views.session_keys(p.cd, session)):
        raise HTTPException(404, f'{session} has no pair {ref}→{tgt}')
    with p.lock:
        return _fit_detail(p, session, ref, tgt, segment)


@app.post('/api/fits/{session}')
def start_fits(session: str):
    p = project()
    p.fit_session = session
    job = p.fit_jobs.get(session)
    if job is None or not job.is_alive():
        links = p.cached(('links', session), lambda: views.pair_links(p.cd, p.sd, session))
        done = p.fits.get(session, {})
        # strongest first, so the visible links fill in early
        pairs = [(l['ref'], l['tgt']) for l in sorted(links, key=lambda l: -l['strength'])
                 if (l['ref'], l['tgt']) not in done]
        p.fit_jobs[session] = threading.Thread(target=_fit_all, args=(p, session, pairs), daemon=True)
        p.fit_jobs[session].start()
    return fits_progress(session)


@app.get('/api/fits/{session}')
def fits_progress(session: str, since: int = 0):
    """Fits finished so far; *since* skips the ones a client already has (they arrive in order)."""
    p = project()
    links = p.cache.get(('links', session), [])
    fits = list(p.fits.get(session, {}).items())
    return dict(done=len(fits), total=len(links), running=bool(p.fit_jobs.get(session) and p.fit_jobs[session].is_alive()),
                fits=[dict(ref=r, tgt=t, **f) for (r, t), f in fits[since:]])


class TagEdit(BaseModel):
    kind: str            # 'pair' | 'neuron'
    group: str
    op: str              # 'add' | 'remove'
    members: dict        # session -> [[ref, tgt]] pair positions, or [neuron_id]


@app.post('/api/tags')
def tags(edit: TagEdit):
    p = project()
    with p.lock:
        writable(p)
        for sess, members in edit.members.items():
            if edit.kind == 'pair':
                for ref, tgt in members:
                    key = views.key_for_pair(p.cd, sess, ref, tgt)
                    bucket = p.sd.get_selection_by_session(key).selections[key.ptr()]
                    if edit.op == 'add':
                        p.sd.groups.add_to_group(edit.group, sess, (ref, tgt))
                        if (ref, tgt) not in bucket.selected and (ref, tgt) not in bucket.deleted:
                            bucket.set_pair_state((ref, tgt), 'sel')
                    else:
                        p.sd.groups.discard_from_group(edit.group, sess, (ref, tgt))
            else:
                for nid in members:
                    key = Key(session=sess, ref=int(nid))
                    (p.sd.neuron_groups.add_member if edit.op == 'add' else p.sd.neuron_groups.discard_member)(edit.group, key)
            p.drop(sess)
        p.unsaved += 1   # one edit however many sessions it spans
    return {sess: _session_data(p, sess) for sess in edit.members}


class Images(BaseModel):
    images: dict[str, str]   # file stem -> base64 PNG


@app.post('/api/images')
def save_images(body: Images):
    """Cards exported from the viewer, into the project's own folder."""
    folder = Path(project().cd.save_path) / 'images'
    folder.mkdir(exist_ok=True)
    for stem, png in body.images.items():
        (folder / f'{Path(stem).name}.png').write_bytes(base64.b64decode(png))
    return dict(folder=str(folder.resolve()))


@app.get('/api/unsaved')
def unsaved():
    return dict(unsaved=project().unsaved)


@app.post('/api/save')
def save():
    """Edits stay in memory until the viewer saves: tags, pair states and peak calls go to disk together."""
    p = project()
    with p.lock:
        writable(p)
        p.sd.save()
        p.sd.neuron_groups.save()
        p.unsaved = 0
        p.cache = {k: v for k, v in p.cache.items() if k[0] not in ('links', 'neurons')}   # a save promotes tagged pairs to selected
    return dict(unsaved=0)


@app.get('/api/segments/{session}')
def segments(session: str):
    p = project()
    return p.cached(('segments', session), lambda: views.segments(p.nd, p.cd, session))


@app.get('/api/segment_links/{session}/{segment}')
def segment_links(session: str, segment: str, norms: str = ''):
    """*norms* (comma-separated NormalizeBy names) apply to the CS as the Qt GUI's do; the excess strength is scale-free."""
    p = project()
    active = [n for n in NormalizeBy if n.name in norms.split(',')]
    return p.cached(('seglinks', session, segment, norms), lambda: views.segment_links(p.cd, p.sd, session, segment, active))


@app.get('/api/neuron_values/{session}')
def neuron_values(session: str):
    p = project()
    return p.cached(('nvalues', session), lambda: views.neuron_values(p.nd, p.cd, p.sd, p.tags, session))


@app.get('/api/placefield/{session}/{nid}')
def placefield(session: str, nid: int):
    p = project()
    return views.placefield(p.curves, session, nid)


class PairState(BaseModel):
    session: str
    pairs: list     # [[ref, tgt]] pair positions
    state: str      # 'sel' | 'unsel' | 'del'


@app.post('/api/pair_state')
def pair_state(edit: PairState):
    """Move pairs between selected, unselected and deleted, as the Qt lists do."""
    p = project()
    with p.lock:
        if edit.state == 'unsel':   # a save promotes tagged pairs back to selected, so the move would silently undo
            tagged = [(r, t) for r, t in edit.pairs if any(not is_special_group(g) for g in p.sd.groups.groups_for_pair(edit.session, r, t))]
            if tagged:
                raise HTTPException(409, f'{len(tagged)} of these pairs carry a group, and tagged pairs stay selected: untag them first.')
        writable(p)
        for ref, tgt in edit.pairs:
            key = views.key_for_pair(p.cd, edit.session, ref, tgt)
            p.sd.get_selection_by_session(key).selections[key.ptr()].set_pair_state((ref, tgt), edit.state)
        p.unsaved += 1
        p.drop(edit.session)
    return session(edit.session)


class PeakCalls(BaseModel):
    session: str
    ref: int
    tgt: int
    calls: list     # [[center_ms, certain]]


@app.post('/api/peak_calls')
def peak_calls(edit: PeakCalls):
    """Hand calls on a pair's fitted peaks, the same store the Qt 'mark peaks' chip writes."""
    p = project()
    with p.lock:
        writable(p)
        key = views.key_for_pair(p.cd, edit.session, edit.ref, edit.tgt)
        p.sd.set_peak_calls(key, (edit.ref, edit.tgt), [(float(c), bool(s)) for c, s in edit.calls])
        p.unsaved += 1
        p.fit_details = {k: v for k, v in p.fit_details.items() if k[:3] != (edit.session, edit.ref, edit.tgt)}
        p.fits.get(edit.session, {}).pop((edit.ref, edit.tgt), None)
        return _fit_detail(p, edit.session, edit.ref, edit.tgt)


@app.get('/api/waveform/{session}/{idx}')
def waveform(session: str, idx: int):
    p = project()
    with p.lock:
        return views.waveform(p.nd, p.cd, session, idx)


SPAWN = mp.get_context('spawn')


def _jitter_list(j) -> dict:
    out = {}
    for k, v in j.items():
        if hasattr(v, 'tolist'):
            out[k] = np.asarray(v, dtype=float).round(5).tolist()
        elif isinstance(v, dict):
            out[k] = {str(q): np.asarray(b, dtype=float).round(5).tolist() for q, b in v.items()}
        else:
            out[k] = v
    return out


@app.post('/api/jitter/{session}/{ref}/{tgt}')
def start_jitter(session: str, ref: int, tgt: int, res: str = 'lowres', njitter: int = 500):
    """Whole-session jitter for one pair, run in its own process as the Qt panel does."""
    p = project()
    job_key = (session, ref, tgt, res)
    busy = [k for k, j in p.jitter.items() if j['result'] is None and j['proc'].is_alive()]
    if job_key not in p.jitter and busy:   # each job copies the session into a process: one at a time
        raise HTTPException(429, f'jitter is still running for pair {busy[0][1]}→{busy[0][2]}; try again when it finishes')
    if job_key not in p.jitter:
        with p.lock:
            key = views.key_for_pair(p.cd, session, ref, tgt)
            d = p.cd.ccg_for(key.change(resolution=res))
            neurons = p.nd.neurons_for(key.nd())
            bin_s = d.conf.duration / (d.ccg.shape[-1] - 1)
            q = SPAWN.Queue()
            proc = SPAWN.Process(target=jitter_worker, args=(q, key, neurons, d, None, ref, tgt, njitter, bin_s, p.cd.conf), daemon=True)
            proc.start()
        p.jitter[job_key] = dict(proc=proc, queue=q, result=None)
    return jitter_status(session, ref, tgt, res)


@app.get('/api/jitter/{session}/{ref}/{tgt}')
def jitter_status(session: str, ref: int, tgt: int, res: str = 'lowres'):
    p = project()
    job = p.jitter.get((session, ref, tgt, res))
    if job is None:
        return dict(status='none')
    if job['result'] is None:
        try:
            job['result'] = job['queue'].get_nowait()
        except queue_mod.Empty:
            if job['proc'].is_alive():
                return dict(status='running')
            job['result'] = {'error': 'jitter worker exited without a result'}
    r = job['result']
    return dict(status='error', error=r['error']) if r.get('error') else dict(status='done', result=_jitter_list(r))


@app.get('/api/themes/{session}')
def themes(session: str):
    p = project()
    return p.cached(('themes', session), lambda: views.themes(p.nd, p.cd, session))


@app.get('/api/extends/{session}')
def extends(session: str):
    p = project()
    return dict(units=views.extends(p.cd, session))


@app.get('/api/extend/{session}/{ref}/{tgt}')
def extend_pair(session: str, ref: int, tgt: int, name: str, window_ms: float, bin_ms: float, segment: str = 'all'):
    p = project()
    with p.lock:
        return views.extend_pair(p.cd, session, ref, tgt, name, window_ms, bin_ms, segment)
