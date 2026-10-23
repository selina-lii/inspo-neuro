"""Pure builders the API serves: neuron table, pair links, layouts and CCG traces, read from nd/cd/sd."""
import numpy as np
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE

from neuropy.analyses.ccg_transforms import ConnectionStrength, ConnStrengthConfig, peak_waveform_on_lag_axis
from neuropy.analyses.neurons_dataset import Key
from neuropy.analyses.peak_fit import fit_peaks
from neuropy.ui.neuron_tag_install import load_tags

EXCESS_WINDOW_MS = (1.0, 6.0)
CH_PER_SHANK = 16   # neuropy.ui.ccg_panel.CH_PER_SHANK; that module imports Qt
ACG_HALF_MS = 30.0


def session_keys(cd, session: str) -> list:
    return [k for k in cd.ptr if str(k.session) == session]


def neuron_positions(nd, nd_key, neurons) -> np.ndarray:
    """Per-unit coordinates when the dataset ships them, else the probe channel's x/y."""
    xy = (neurons.metadata or {}).get('positions')
    if xy is not None:
        return np.asarray(xy, dtype=float)
    df = nd.probe_info[nd_key].to_dataframe().set_index('channel_id')
    ch = np.asarray(neurons.peak_channels, dtype=int)
    return np.stack([df['x'].reindex(ch).fillna(0.0).to_numpy(float),
                     df['y'].reindex(ch).fillna(0.0).to_numpy(float)], axis=1)


def shank_geometry(nd, nd_key, neurons, xy: np.ndarray) -> tuple:
    """``(shank per neuron, [{id, x0, x1, y0, y1, inferred}])``: from the probe's contacts when it has them, else from the neurons."""
    probe = nd.probe_info.get(nd_key)
    if probe is not None and neurons.peak_channels is not None:
        df = probe.to_dataframe()
        by_channel = df.set_index('channel_id')['shank_id']
        of = [None if ch not in by_channel.index else int(by_channel[ch]) for ch in np.asarray(neurons.peak_channels, dtype=int)]
        shanks = [dict(id=int(s), x0=float(g.x.min()), x1=float(g.x.max()), y0=float(g.y.min()), y1=float(g.y.max()), inferred=False)
                  for s, g in df.groupby('shank_id')]
        return of, shanks
    ids = getattr(neurons, 'shank_ids', None)
    of = [int(s) for s in ids] if ids is not None else [int(round(x)) for x in xy[:, 0]]   # no shank: one per x position
    shanks = []
    for s in sorted(set(of)):
        pts = xy[[i for i, v in enumerate(of) if v == s]]
        shanks.append(dict(id=s, x0=float(pts[:, 0].min()), x1=float(pts[:, 0].max()), y0=float(pts[:, 1].min()), y1=float(pts[:, 1].max()), inferred=True))
    return of, shanks


def neuron_table(nd, cd, sd, session: str) -> list:
    nd_key = session_keys(cd, session)[0].nd()
    n = nd.neurons_for(nd_key)
    xy = neuron_positions(nd, nd_key, n)
    meta = n.metadata or {}
    area = meta.get('cell_area', ['?'] * n.n_neurons)
    shank = getattr(n, 'shank_ids', None)
    ch = n.peak_channels
    probe_shank, _ = shank_geometry(nd, nd_key, n, xy)
    return [dict(idx=i, id=int(n.neuron_ids[i]), x=float(xy[i, 0]), y=float(xy[i, 1]), probe_shank=probe_shank[i],
                 shank=None if shank is None else int(shank[i]), channel=None if ch is None else int(ch[i]),
                 type=str(n.neuron_type[i]), area=str(area[i]), rate=float(n.firing_rate[i]),
                 groups=sorted(sd.neuron_groups.groups_for_member(Key(session=session, ref=int(n.neuron_ids[i])))))
            for i in range(n.n_neurons)]


def shanks(nd, cd, session: str) -> list:
    nd_key = session_keys(cd, session)[0].nd()
    n = nd.neurons_for(nd_key)
    return shank_geometry(nd, nd_key, n, neuron_positions(nd, nd_key, n))[1]


def _lag_bins(n_bins: int, duration: float, lo_ms: float, hi_ms: float) -> slice:
    bin_ms = duration * 1e3 / (n_bins - 1)
    c = n_bins // 2
    return slice(c + int(np.floor(lo_ms / bin_ms + 0.5)), c + int(np.ceil(hi_ms / bin_ms - 0.5)) + 1)


def excess_z(d, excitability: str) -> np.ndarray:
    """Per pair, the CCG's counts over its baseline in the mono window, in Poisson SDs (signed: I pairs dip)."""
    w = _lag_bins(d.ccg.shape[-1], d.conf.duration, *EXCESS_WINDOW_MS)
    obs, null = d.ccg[0][..., w].sum(-1), d.ccg_null[0][..., w].sum(-1)
    z = (obs - null) / np.sqrt(np.maximum(null, 1.0))
    return -z if excitability == 'I' else z


def pair_links(cd, sd, session: str) -> list:
    out = []
    for k in session_keys(cd, session):
        ptr = cd.ptr[k]
        bucket = sd.get_selection_by_session(k).selections[k.ptr()]
        z = excess_z(cd.ccg_for(k), k.excitability)
        arrays = sd.rule_results(k, 'all').arrays
        passed = {name[:-7]: np.asarray(a) & ~np.isnan(arrays[name[:-7] + '.value'])
                  for name, a in arrays.items() if name.endswith('.passed') and ':' not in name}   # sets, not their rules
        for r, t in sorted(ptr.pair_set):
            if r == t:
                continue
            p = (int(r), int(t))
            out.append(dict(ref=p[0], tgt=p[1], type=k.type_label(), ei=k.excitability,
                            state='del' if p in bucket.deleted else 'sel' if p in bucket.selected else 'unsel',
                            groups=sorted(sd.groups.groups_for_pair(session, *p)),
                            rules=sorted(n for n, a in passed.items() if a[p]),
                            strength=round(float(z[p]), 2)))
    return out


def key_for_pair(cd, session: str, ref: int, tgt: int):
    return next(k for k in session_keys(cd, session) if (ref, tgt) in cd.ptr[k].pair_set)


def _fit_inputs(cd, key, ref: int, tgt: int, segment: str):
    d, i = _seg_data(cd, key, 'highres', segment)
    bin_s = d.conf.duration / (d.ccg.shape[-1] - 1)
    ccg = d.ccg[i][ref, tgt]
    return ccg, ConnectionStrength.baseline(ccg, d.ccg_null[i][ref, tgt], d.conf, 'conv', bin_size_eff=bin_s), bin_s


def pair_fit(cd, sd, key, ref: int, tgt: int, segment: str = 'all'):
    ccg, baseline, bin_s = _fit_inputs(cd, key, ref, tgt, segment)
    fit = fit_peaks(ccg, baseline, bin_s)
    return fit.with_calls(sd.peak_calls(key, (ref, tgt))) if fit else None


def fit_summary(fit) -> dict:
    if fit is None:
        return dict(fitted=False, confident=False)
    mono = next((p for p in fit.mono if p.confident), None) or next(iter(fit.mono), None)
    return dict(fitted=True, confident=fit.confident, label=fit.label,
                latency=None if mono is None else round(mono.center, 3),
                fwhm=None if mono is None else round(mono.fwhm, 3),
                n_peaks=len(fit.peaks), hand=any(p.called for p in fit.peaks))


def _seg_data(cd, key, res: str, segment: str):
    """The CCG data holding *segment* and its index in dim0; 'all' is the whole session."""
    d = cd.ccg_for(key.change(resolution=res) if segment == 'all' else key.change(resolution=res, segment=segment))
    return d, (0 if segment == 'all' else d.segment_index(segment))


def session_traces(cd, session: str, segment: str = 'all') -> tuple:
    """``(meta, {res: float32 bytes, res_acg: …})``: every pair's CCG then baseline in *segment*, one row per pair in meta's order; one ACG row per neuron."""
    meta = dict(pairs=[])
    blocks = {'lowres': [], 'highres': []}
    pvals = {f'{res}_{kind}': [] for res in blocks for kind in ('p', 'pc')}
    k0 = session_keys(cd, session)[0]
    n = cd.nd.neurons_for(k0.nd()).n_neurons
    acgs = {}
    for res in blocks:   # each neuron's ACG, from the first conn type: every type's matrix holds every neuron
        d, i = _seg_data(cd, k0, res, segment)
        acgs[res] = d.ccg[i][np.arange(n), np.arange(n)].astype(np.float32)
    for k in session_keys(cd, session):
        pairs = sorted(p for p in cd.ptr[k].pair_set if p[0] != p[1])
        if not pairs:
            continue
        refs, tgts = np.array(pairs).T
        meta['pairs'] += [[int(r), int(t)] for r, t in pairs]
        for res in blocks:
            d, i = _seg_data(cd, k, res, segment)
            n_bins = d.ccg.shape[-1]
            half = d.conf.duration * 1e3 / 2
            meta[f'{res}_lags'] = np.linspace(-half, half, n_bins).round(4).tolist()
            blocks[res].append(np.concatenate([d.ccg[i][refs, tgts], d.ccg_null[i][refs, tgts]], axis=1).astype(np.float32))
            pvals[f'{res}_p'].append(d.pval[i][refs, tgts].astype(np.float32))
            pvals[f'{res}_pc'].append(d.pval_corrected[i][refs, tgts].astype(np.float32))
    meta['n_neurons'] = int(n)
    out = {res: np.concatenate(rows).tobytes() if rows else b'' for res, rows in blocks.items()}
    out.update({f'{res}_acg': a.tobytes() for res, a in acgs.items()})
    out.update({name: np.concatenate(rows).tobytes() if rows else b'' for name, rows in pvals.items()})
    return meta, out


def fit_detail(fit) -> dict:
    out = fit_summary(fit)
    if fit is not None:
        out.update(lags=fit.lags.round(4).tolist(), curve=fit.curve.tolist(),
                   peaks=[dict(center=p.center, fwhm=p.fwhm, edges=list(p.edges), confident=p.confident,
                               called=p.called, mono=fit.is_mono(p)) for p in fit.peaks])
    return out


def acg_features(cd, session: str, n_neurons: int) -> np.ndarray:
    """Each neuron's lo-res ACG within ±ACG_HALF_MS, as a rate-free shape (each row sums to 1)."""
    k = session_keys(cd, session)[0]
    d = cd.ccg_for(k)
    acg = np.stack([d.ccg[0][i, i] for i in range(n_neurons)])
    w = _lag_bins(acg.shape[-1], d.conf.duration, -ACG_HALF_MS, ACG_HALF_MS)
    acg = acg[:, w].astype(float)
    acg[:, acg.shape[1] // 2] = 0.0   # the zero-lag bin is the spike itself
    return acg / np.maximum(acg.sum(1, keepdims=True), 1.0)


def embedding(cd, neurons: list, links: list, session: str, seed: int = 0, dims: int = 2) -> np.ndarray:
    """t-SNE of ACG shape, log rate and in/out link strength: neurons that fire and connect alike sit together."""
    n = len(neurons)
    deg = np.zeros((n, 4))
    for l in links:
        col = 0 if l['ei'] == 'E' else 2
        deg[l['ref'], col] += max(l['strength'], 0)
        deg[l['tgt'], col + 1] += max(l['strength'], 0)
    feats = np.hstack([acg_features(cd, session, n) * 10,
                       np.log10([[max(x['rate'], 1e-3)] for x in neurons]),
                       np.log1p(deg) / 3])
    reduced = PCA(n_components=min(20, n - 1, feats.shape[1]), random_state=seed).fit_transform(feats)
    return TSNE(n_components=dims, perplexity=min(30, max(5, n // 10)), random_state=seed,
                init='pca').fit_transform(reduced)


def segments(nd, cd, session: str) -> dict:
    """The session's segments by start time, with their intervals in seconds, and the session's bounds."""
    k = session_keys(cd, session)[0]
    out = []
    for name in cd.available_segments(k):
        iv = cd.segment_intervals(k, name)
        if iv:
            out.append(dict(name=name, intervals=[[float(a), float(b)] for a, b in iv],
                            start=float(iv[0][0]), stop=float(iv[-1][1]), duration=float(sum(b - a for a, b in iv))))
    out.sort(key=lambda s: (s['start'], -s['duration']))
    t0, t1 = nd.session_bounds(k.nd())
    return dict(segments=out, bounds=[float(t0), float(t1)])


def segment_links(cd, sd, session: str, segment: str, norms: list) -> dict:
    """Per link (in pair_links order): excess strength, the GUI's connection strength (STG, lo-res test window, after *norms*)
    and on/off in *segment*; on is the GUI's verdict (rule sets, p-value screen, hand overrides)."""
    strength, cs, on = [], [], []
    conf = cd.conf.at('lowres')
    cfg = ConnStrengthConfig('conv', 'STG', conf.min_lag_bin, conf.max_lag_bin, 'flag', '')
    for k in session_keys(cd, session):
        pairs = [p for p in sorted(cd.ptr[k].pair_set) if p[0] != p[1]]
        if not pairs:
            continue
        d = cd.ccg_for(k.change(segment=segment))
        i = d.segment_index(segment)
        w = _lag_bins(d.ccg.shape[-1], d.conf.duration, *EXCESS_WINDOW_MS)
        obs, null = d.ccg[i][..., w].sum(-1), d.ccg_null[i][..., w].sum(-1)
        z = (obs - null) / np.sqrt(np.maximum(null, 1.0)) * (-1 if k.excitability == 'I' else 1)
        grid = sd.on_grid(k, segment)
        cs_grid = cd.get_conn_strength_for(k.change(resolution='lowres', segment=None if segment == 'all' else segment), norms, cfg, grid)
        for r, t in pairs:
            strength.append(round(float(z[r, t]), 2))
            cs.append(None if not np.isfinite(cs_grid[r, t]) else round(float(cs_grid[r, t]), 4))
            on.append(bool(grid[r, t]))
    return dict(segment=segment, strength=strength, cs=cs, on=on)


def _clean(a) -> list:
    return [None if a is None or not np.isfinite(v) else round(float(v), 4) for v in a]


def firing_rates(nd, cd, session: str) -> dict:
    """Per segment, each neuron's firing rate in neuron position order; 'all' for the whole session."""
    k = session_keys(cd, session)[0]
    rates = {}
    for seg in cd.available_segments(k):
        src = cd.source_config(k.change(segment=seg), seg)
        if src is not None and src.firing_rates:
            rates[seg] = _clean(np.asarray(src.firing_rates, dtype=float))
    rates['all'] = _clean(np.asarray(nd.neurons_for(k.nd()).firing_rate, dtype=float))
    return rates


def neuron_values(nd, cd, sd, tags, session: str) -> dict:
    """Everything a neuron can be coloured or labelled by: firing rate per segment, tag specs (values and labels), place fields."""
    k = session_keys(cd, session)[0]
    ids = np.asarray(nd.neurons_for(k.nd()).neuron_ids)
    rates = firing_rates(nd, cd, session)
    specs = []
    for spec in tags.specs.values():
        values = tags.values_for(spec, k)
        if values is None:
            continue
        labels = tags.assign_array(spec, k)
        colors = spec.colors()
        specs.append(dict(name=spec.prefix, source=spec.source, values=_clean(values),
                          labels=None if labels is None else [None if not isinstance(l, str) or l not in colors else l for l in labels],
                          colors={l: '#%02x%02x%02x' % tuple(int(c) for c in rgb) for l, rgb in colors.items()}))
    pf = cd.placefields
    place = {}
    for seg in pf.segments():
        if pf.has_session(session):
            place[seg] = dict(frmax=_clean([pf.neuron_stat(session, int(i), 'FRmax', seg) for i in ids]),
                              is_place=[bool(x) for x in pf.place_cell_mask(session, [seg], ids)])
    return dict(rates=rates, specs=specs, place=place)


def placefield(curves, session: str, nid: int) -> dict:
    """The neuron's saved 1D tuning curves per block and direction (NaN where the track was not run)."""
    out = []
    for block in curves.blocks():
        for direction in curves.DIRECTIONS:
            c = curves.curve(session, block, direction, nid, 1.5)
            if c is not None:
                out.append(dict(block=block, direction=direction,
                                rate=[None if not np.isfinite(v) else round(float(v), 3) for v in c[0]]))
    return dict(curves=out)


def waveform(nd, cd, session: str, idx: int) -> dict:
    """The neuron's peak-channel waveform on a ms axis, as the Qt panel overlays it."""
    n = nd.neurons_for(session_keys(cd, session)[0].nd())
    t, amp = peak_waveform_on_lag_axis(n, idx, CH_PER_SHANK)
    return dict(t_ms=None if t is None else np.asarray(t, dtype=float).round(4).tolist(),
                amp=None if amp is None else np.asarray(amp, dtype=float).round(4).tolist())


def themes(nd, cd, session: str) -> dict:
    """The session's epoch themes (paradigm, brain states…) as [start, stop, label] in seconds, as the Qt time slider reads them."""
    out = {}
    for name, ep in nd.get_themes(session_keys(cd, session)[0].nd()).items():
        if ep is None:
            continue
        labels = [str(x).strip() for x in ep.labels]
        unlabelled = len({l for l in labels if l}) <= 1   # the theme is the label
        out[name] = [[float(a), float(b), name if unlabelled else l] for a, b, l in zip(ep.starts, ep.stops, labels)]
    return out


def extends(cd, session: str) -> list:
    """Stored extend units of the session: wider CCG windows saved from the Qt panel."""
    return [dict(name=n, window_ms=float(w), bin_ms=float(b), n_computed=int(c), segment=sg)
            for n, s, w, b, c, sg in cd.saved_extends() if s == session]


def extend_pair(cd, session: str, ref: int, tgt: int, name: str, window_ms: float, bin_ms: float, segment: str) -> dict:
    """One pair from a stored extend unit, with ACGs and the hollow-convolution baseline the Qt panel refits; None when not computed."""
    k = session_keys(cd, session)[0].nd()
    hit = cd.extend_ccg_for(name, k.change(segment=segment), window_ms, bin_ms)   # 'all' is a segment label here, as the Qt panel passes it
    if hit is None or max(ref, tgt) >= hit[1].shape[0] or not hit[1][np.ix_([ref, tgt], [ref, tgt])].all():
        return dict(computed=False)
    ccg = np.asarray(hit[0][ref, tgt], dtype=float)
    n = ccg.shape[-1]
    half = window_ms / 2
    baseline = ConnectionStrength.baseline_conv(ccg, None, cd.conf, bin_size_eff=bin_ms / 1e3)
    return dict(computed=True, lags=np.linspace(-half, half, n).round(4).tolist(), ccg=ccg.tolist(), baseline=np.asarray(baseline).tolist(),
                acg_ref=np.asarray(hit[0][ref, ref], dtype=float).tolist(), acg_tgt=np.asarray(hit[0][tgt, tgt], dtype=float).tolist())
