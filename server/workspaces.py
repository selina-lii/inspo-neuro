# Named workspaces: everything the viewer arranged in a project's space, one JSON each under state/<project>/workspaces/.
import json
import shutil
import time

from fastapi import APIRouter, Body, HTTPException

from server.project import STATE_DIR, project, state_json, update_state_json

router = APIRouter(prefix='/api/workspaces')


def _path(name: str):
    if not name.strip() or name.startswith('.'):
        raise HTTPException(400, f'bad workspace name {name!r}')
    return state_json(project(), f'workspaces/{name}')


@router.get('')
def names():
    p = project()
    folder = STATE_DIR / p.name / 'workspaces'
    legacy = state_json(p, 'stats_workspace')
    if not folder.exists() and legacy.exists():   # the stats workspace this replaced opens as the first one
        update_state_json(p, 'workspaces/untitled 1', lambda _: json.loads(legacy.read_text()))
    files = sorted(folder.glob('*.json'), key=lambda f: f.stat().st_mtime, reverse=True) if folder.exists() else []
    return dict(names=[f.stem for f in files])


@router.get('/{name}')
def read(name: str):
    path = _path(name)
    if not path.exists():
        raise HTTPException(404, f'no workspace {name!r}')
    return json.loads(path.read_text())


@router.put('/{name}')
def write(name: str, doc: dict = Body(...)):
    _path(name)
    update_state_json(project(), f'workspaces/{name}', lambda _: doc)
    return dict(ok=True)


@router.post('/{name}/rename')
def rename(name: str, to: str = Body(..., embed=True)):
    src, dst = _path(name), _path(to)
    if dst.exists():
        raise HTTPException(409, f'workspace {to!r} exists')
    src.rename(dst)
    return dict(ok=True)


@router.delete('/{name}')
def delete(name: str):
    dest = STATE_DIR / project().name / 'backups' / 'workspaces' / time.strftime('%Y%m%d_%H%M%S')
    dest.mkdir(parents=True, exist_ok=True)
    shutil.move(_path(name), dest)   # a deleted workspace stays recoverable
    return dict(ok=True)
