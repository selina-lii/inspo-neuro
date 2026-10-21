"""The one open project and the rules every write follows: one writer, and a backup first."""
import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

from fastapi import HTTPException

from neuropy.analyses.ms_connectivity import open_project
from server import views

NEUROPY_ROOT = Path(os.environ.get('NEUROPY_ROOT', '/Users/selinl/Documents/ms_synchrony/NeuroPy'))
STATE_DIR = Path(os.environ.get('NEUROMAP_STATE', Path(__file__).resolve().parent.parent / 'state'))
os.chdir(NEUROPY_ROOT)   # project paths in NeuroPy are relative to its root

DATA_LOCK = threading.RLock()   # NeuroPy's loaders are not safe to run from two threads at once
STATE_LOCK = threading.Lock()   # sync routes run on a thread pool: two saves of one file would interleave


class Project:
    """The open project, with per-session caches of everything slow to build."""

    def __init__(self, name: str):
        with DATA_LOCK:
            self.nd, self.cd, self.sd = open_project(name, [])
            self.sd.ensure_groups_loaded_for(list(self.cd.sessions))
        self.name = name
        self.lock = DATA_LOCK
        self.cache: dict = {}
        self.fits: dict = {}        # session -> {(ref, tgt): summary}
        self.fit_details: dict = {} # (session, ref, tgt) -> summary plus curve and peaks
        self.fit_jobs: dict = {}    # session -> thread
        self.fit_session = None     # only the session in view keeps fitting
        self.backed_up = False
        self.unsaved = 0            # edits since the last save; they live only in memory until then
        self.jitter: dict = {}      # (session, ref, tgt, res) -> {'proc', 'queue', 'result'}
        with DATA_LOCK:
            self.tags = views.load_tags(self.cd, self.sd)
            self.curves = self.cd.placefield_curves

    def cached(self, key, build):
        with self.lock:
            if key not in self.cache:
                self.cache[key] = build()
            return self.cache[key]

    def focus_session(self, session: str):
        """Keep one session in memory: the others' CCG arrays, traces and fit details are released."""
        with self.lock:
            if getattr(self, 'session', None) == session:
                return
            self.session = session
            self.cache = {k: v for k, v in self.cache.items() if k[1] == session}
            self.fit_details = {k: v for k, v in self.fit_details.items() if k[0] == session}
            self.release_others()

    def release_others(self):
        """Drop the CCG arrays of every session but the one in view."""
        with self.lock:
            for k in [k for k in self.cd._ccg if str(k.session) != getattr(self, 'session', None)]:
                self.cd._ccg.pop(k)

    def drop(self, session: str):
        with self.lock:
            self.cache = {k: v for k, v in self.cache.items() if k[1] != session}


state: dict = {}


def project() -> Project:
    if 'p' not in state:
        raise HTTPException(409, 'no project open')
    return state['p']


def state_json(p: Project, name: str) -> Path:
    return STATE_DIR / p.name / f'{name}.json'


def update_state_json(p: Project, name: str, change) -> None:
    """Rewrite one state JSON as ``change(old or None)``, atomically and one writer at a time."""
    path = state_json(p, name)
    with STATE_LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix('.tmp')
        tmp.write_text(json.dumps(change(json.loads(path.read_text()) if path.exists() else None)))
        tmp.replace(path)


def _qt_gui_running() -> bool:
    return subprocess.run(['pgrep', '-f', 'run_ccg_gui[.]py'], capture_output=True).returncode == 0   # the GUI script itself, not commands that mention it


def _backup(p: Project):
    """One copy of everything a tag write touches, before this server's first write."""
    dest = STATE_DIR / p.name / 'backups' / time.strftime('%Y%m%d_%H%M%S')
    # rule arrays and legacy custom tags are never written here, and copying them stalls the first edit
    shutil.copytree(p.cd.selections_dir, dest / 'selections', ignore=shutil.ignore_patterns('rule_results', '*.customtags.json'))
    shutil.copy2(p.sd.groups.save_path() + '.json', dest / 'groups.json')
    ng = p.sd.neuron_groups.save_path() + '.json'
    if os.path.isfile(ng):
        shutil.copy2(ng, dest / 'neuron_groups.json')
    p.backed_up = True


def writable(p: Project):
    if _qt_gui_running():
        raise HTTPException(423, 'The Qt GUI is open: close it before editing here.')
    if not p.backed_up:
        _backup(p)
