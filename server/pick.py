"""Pair picks for CCG grids: rules as a stats row applies them, then pair state and value ranges."""
from fastapi import APIRouter
from pydantic import BaseModel

from neuropy.analyses.pair_selection_data import DerivedRule

from server import views
from server.project import project

router = APIRouter(prefix='/api/pick')


class Range(BaseModel):
    field: str   # 'strength', 'cs' or 'rate'
    segment: str = 'all'
    side: str = 'either'   # a rate's neuron, as DerivedRule.SIDES
    lo: float | None = None
    hi: float | None = None


class Pick(BaseModel):
    sessions: list[str] = []
    conn_types: list[str] = []
    rules: list[dict] = []
    states: list[str] = []
    ranges: list[Range] = []


def _inside(v, r: Range) -> bool:
    return v is not None and (r.lo is None or v >= r.lo) and (r.hi is None or v <= r.hi)


def _rate_ok(rates: list, ref: int, tgt: int, r: Range) -> bool:
    a, b = _inside(rates[ref], r), _inside(rates[tgt], r)
    return {'ref': a, 'tgt': b, 'both': a and b}.get(r.side, a or b)


def _session(p, session: str, cfg: Pick, rules: list) -> list:
    links = views.pair_links(p.cd, p.sd, session)
    keep = p.sd.groups.derived.rule_based_filter(rules, session) if rules else None
    cs = {r.segment: views.segment_links(p.cd, p.sd, session, r.segment, [])['cs'] for r in cfg.ranges if r.field == 'cs'}
    rates = views.firing_rates(p.nd, p.cd, session) if any(r.field == 'rate' for r in cfg.ranges) else {}
    out = []
    for i, l in enumerate(links):
        ref, tgt = l['ref'], l['tgt']
        if keep is not None and (ref, tgt) not in keep or cfg.states and l['state'] not in cfg.states \
                or cfg.conn_types and l['type'] not in cfg.conn_types:
            continue
        if all(_inside(l['strength'], r) if r.field == 'strength' else _inside(cs[r.segment][i], r) if r.field == 'cs'
               else _rate_ok(rates[r.segment], ref, tgt, r) for r in cfg.ranges):
            out.append(f'{session}|{ref}|{tgt}')
    return out


@router.post('')
def pick(cfg: Pick):
    p = project()
    rules = [DerivedRule(**r) for r in cfg.rules]
    out = []
    for session in cfg.sessions or list(p.cd.sessions):
        # the lock is taken a session at a time, so the viewer's own loads get in between
        with p.lock:
            try:
                out += _session(p, session, cfg, rules)
            finally:
                p.release_others()
    return dict(pairs=out)
