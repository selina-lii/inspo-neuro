"""A session as one layer of a stats test's network stack: built ad hoc, then the session is released unless it is in view."""
import numpy as np
from fastapi import APIRouter

from neuropy.analyses.ccg_transforms import NormalizeBy

from server import views
from server.project import project

router = APIRouter(prefix='/api/stack')


@router.get('/{session}')
def layer(session: str, segments: str = '', pairs: str = '', res: str = 'lowres', norms: str = '', light: bool = False):
    """*light*: the pairs' traces and the neurons only, for one picked pair's card."""
    p = project()
    segs = [s for s in segments.split(',') if s]
    wanted = [tuple(map(int, x.split('-'))) for x in pairs.split(',') if x]
    active = [NormalizeBy[n] for n in norms.split(',') if n]
    with p.lock:
        try:
            known = {s['name']: s['duration'] for s in views.segments(p.nd, p.cd, session)['segments']}
            segs = [s for s in segs if s == 'all' or s in known]
            out = dict(neurons=views.neuron_table(p.nd, p.cd, p.sd, session), hours={s: known.get(s, sum(known.values())) / 3600 for s in segs},
                       links=[] if light else views.pair_links(p.cd, p.sd, session), shanks=[] if light else views.shanks(p.nd, p.cd, session),
                       seg_links={} if light else {s: views.segment_links(p.cd, p.sd, session, s, active) for s in segs}, traces={})
            for s in segs:
                rows = {}
                for ref, tgt in wanted:
                    d, i = views._seg_data(p.cd, views.key_for_pair(p.cd, session, ref, tgt), res, s)
                    rows[f'{ref}-{tgt}'] = [np.round(x, 3).tolist() for x in (d.ccg[i][ref, tgt], d.ccg_null[i][ref, tgt], d.ccg[i][ref, ref], d.ccg[i][tgt, tgt])]
                    out['lags'] = np.linspace(-d.conf.duration * 500, d.conf.duration * 500, d.ccg.shape[-1]).round(4).tolist()
                out['traces'][s] = rows
            return out
        finally:
            p.release_others()
