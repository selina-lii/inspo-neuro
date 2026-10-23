"""Stats tests for the web: what the editor may pick, and results as one record per value that boards reference by id."""
import math

from neuropy.analyses.pair_selection_data import DerivedRule
from neuropy.analyses.utils import group_display_name
from neuropy.ui.app_state import _ALL_SEGS, FAMILY_PREFIX, DisplayConfig
from neuropy.ui.stats_tests_backend import (
    _BAR_COLORS, DISABLED_METRICS, METRICS, P_ADJUST, PICKERS, TEST_N_GROUPS, TEST_TYPES,
    RowConfig, StatsTestBackend, StatsTestConfig, _ViewConfig, pairwise_pvals, plot_ns)

RES_DROP = ('common_pairs', 'norm_vals', 'norm_pairs')   # carried by the rows instead


def rule_choices(cd, sd) -> dict:
    """Per rule kind, ``{name: values}`` as the Qt rule row offers them; '' when the kind takes no name."""
    # no conn-type rule: rows and pair nodes pick conn types on their own
    return {
        DerivedRule.PAIR_TAG: {'': sd.groups.groups + sd.groups.special_groups()},
        # distance takes a number, not a pick from a list
        DerivedRule.PAIR_LOCATION: {**{n: ['yes', 'no'] for n in DerivedRule.NAMED[DerivedRule.PAIR_LOCATION]}, DerivedRule.DISTANCE: []},
        DerivedRule.PAIR_SIGNIFICANCE: {r.name: list(DerivedRule.VERDICTS) for r in cd.rule_book.later_sets()},
        DerivedRule.NEURON_TAG: {n: list(cd.nd.tag_labels(n)) for n in cd.nd.tag_names},
        DerivedRule.NEURON_GROUP: {'': list(sd.neuron_groups.groups)},
    }


def options(b: StatsTestBackend) -> dict:
    rules = rule_choices(b.cd, b.sd)
    names = {v for kind in rules.values() for vals in kind.values() for v in vals}
    return dict(
        pickers={k: dict(field=f, label=label, plural=plural, items=[] if k == 'grp' else getattr(b, prov)())
                 for k, (f, label, plural, prov) in PICKERS.items()},
        families=b.segment_families(), family_prefix=FAMILY_PREFIX, all_segments=_ALL_SEGS,
        disabled_metrics=list(DISABLED_METRICS), test_types=list(TEST_TYPES), p_adjust=list(P_ADJUST), test_n_groups=TEST_N_GROUPS,
        rules=rules, sides=list(DerivedRule.SIDES), display={n: group_display_name(n) for n in names},
        colors=_BAR_COLORS, defaults=dict(test=StatsTestConfig().serialize(), view=_ViewConfig().serialize(),
                                          row=RowConfig().serialize(), display=DisplayConfig().serialize()))


def _clean(x):
    """JSON has no NaN: non-finite floats become null."""
    if isinstance(x, float):
        return x if math.isfinite(x) else None
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    return x


def _row_sig(row: RowConfig) -> str:
    return '+'.join(row.segments) or _ALL_SEGS


def _value_id(session, ref, tgt, sig: str, res: str, dtype: str) -> str:
    return f"{session}|{ref}|{tgt}|{sig}|{res}|{dtype}"


def result_payload(b: StatsTestBackend, results: list) -> dict:
    """``{values, results, text}``: every value once, each result's rows as value ids plus their plotted y."""
    values: dict = {}
    out = []
    paired_test = b.test_config.test_type == "Pairwise t-test"
    for sr in results:
        rows = [r for r in b.rows if sr.resolution in (r.resolution or b.available_resolutions())]
        sigs = [_row_sig(r) for r in rows]
        dtype = rows[0].data_type

        def ids(gi: int, group: dict) -> list:
            return [_value_id(k.session, k.ref, k.tgt, sigs[gi], sr.resolution, dtype) for k in group['pairs']]

        flagged = [ids(gi, g) for gi, g in enumerate(sr.flagged_groups)]
        for gi, g in enumerate(sr.flagged_groups):
            for vid, k, v in zip(flagged[gi], g['pairs'], g['vals']):
                values[vid] = dict(pair=f"{k.session}|{k.ref}|{k.tgt}", session=str(k.session), ref=k.ref, tgt=k.tgt,
                                   row=sigs[gi], res=sr.resolution, metric=dtype, raw=v)
        plotted = []
        if sr.is_one_sample and sr.plot_groups:
            g = sr.plot_groups[0]
            session_of = {(k.ref, k.tgt): k.session for k in sr.groups[0]['pairs']}
            sig = f"{sigs[0]}→{sigs[1]}"
            row_ids = []
            for (ref, tgt), v in zip(g['pairs'], g['vals']):
                vid = _value_id(session_of[(ref, tgt)], ref, tgt, sig, sr.resolution, dtype)
                values[vid] = dict(pair=f"{session_of[(ref, tgt)]}|{ref}|{tgt}", session=str(session_of[(ref, tgt)]),
                                   ref=ref, tgt=tgt, row=sig, res=sr.resolution, metric=dtype, raw=v)
                row_ids.append(vid)
            plotted.append(dict(name=g['name'], color=_BAR_COLORS[0], ids=row_ids, y=g['vals']))
        else:
            for gi, g in enumerate(sr.plot_groups or []):
                plotted.append(dict(name=g.get('name') or chr(65 + gi), color=g.get('color') or _BAR_COLORS[gi % len(_BAR_COLORS)],
                                    ids=ids(gi, g), y=g['vals']))
        outliers = sorted({flagged[gi][j] for gi, idx in sr.outliers.items() for j in idx})
        out.append(dict(
            resolution=sr.resolution, metric=dtype, rows=plotted, outliers=outliers,
            paired=paired_test or sr.is_paired, one_sample=sr.is_one_sample, zscored=sr.zscored, log_shift=sr.log_shift,
            n=plot_ns(sr), brackets=pairwise_pvals(sr.res, sr.plot_groups or []),
            res={k: v for k, v in (sr.res or {}).items() if k not in RES_DROP}))
    return _clean(dict(values=values, results=out, text=b.result_text(results),
                       missing={seg: sorted(s) for seg, s in b.missing_segments.items()},
                       tail_fallbacks=[list(r) for r in b.tail_fallbacks()]))
