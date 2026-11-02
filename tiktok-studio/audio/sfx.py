#!/usr/bin/env python3
"""Procedural SFX library. Every sound is synthesised from code (no samples, no
licensing questions). Stereo float32 @ 48 kHz.

    python3 audio/sfx.py --render audio/sfx_preview   # writes every sound as wav
"""
import argparse
import os

import numpy as np
from scipy.signal import butter, sosfilt, stft, istft, fftconvolve

SR = 48000


def _t(dur):
    return np.arange(int(dur * SR)) / SR


def _rng(seed):
    return np.random.default_rng(seed)


def _bp(x, lo, hi, order=4):
    sos = butter(order, [max(20, lo), min(SR / 2 - 100, hi)], btype="band", fs=SR, output="sos")
    return sosfilt(sos, x)


def _lp(x, f, order=4):
    return sosfilt(butter(order, min(f, SR / 2 - 100), btype="low", fs=SR, output="sos"), x)


def _hp(x, f, order=4):
    return sosfilt(butter(order, max(20, f), btype="high", fs=SR, output="sos"), x)


def _pink(n, seed):
    w = _rng(seed).standard_normal(n)
    f = np.fft.rfft(w)
    k = np.arange(len(f))
    k[0] = 1
    f /= np.sqrt(k)
    p = np.fft.irfft(f, n)
    return p / (np.abs(p).max() + 1e-9)


def _sweep_filter(x, f_of_t, width_oct=0.9):
    """time-varying band-pass via STFT masking. f_of_t: array of centre freqs per STFT frame."""
    nper = 1024
    f, tt, Z = stft(x, fs=SR, nperseg=nper, noverlap=nper * 3 // 4)
    fc = np.interp(tt, np.linspace(0, tt[-1] if len(tt) else 1, len(f_of_t)), f_of_t)
    lf = np.log2(np.maximum(f, 1.0))[:, None]
    mask = np.exp(-0.5 * ((lf - np.log2(fc)[None, :]) / (width_oct / 2.355)) ** 2)
    _, y = istft(Z * mask, fs=SR, nperseg=nper, noverlap=nper * 3 // 4)
    y = y[: len(x)]
    return np.pad(y, (0, len(x) - len(y)))


def _env(n, a, d, shape=2.0):
    """attack fraction a (0..1), decay curve exponent."""
    t = np.linspace(0, 1, n)
    e = np.where(t < a, (t / max(a, 1e-6)) ** 1.5, (1 - (t - a) / max(1 - a, 1e-6)) ** shape)
    return np.clip(e, 0, 1)


def _expdec(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def _reverb(x, seconds=1.2, mix=0.25, seed=7, damp=5000):
    n = int(seconds * SR)
    rng = _rng(seed)
    out = []
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (seconds * SR / 6.5))
        ir = _lp(ir, damp, 2)
        ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        ir /= np.sqrt((ir ** 2).sum()) + 1e-9
        out.append(fftconvolve(x, ir)[: len(x) + n])
    wet = np.stack(out, axis=1)
    dry = np.zeros_like(wet)
    dry[: len(x), 0] = x
    dry[: len(x), 1] = x
    return dry * (1 - mix) + wet * mix


def _stereo(x, pan=0.0):
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l * 1.414, x * r * 1.414], axis=1)


def _panner(x, pans):
    p = np.interp(np.linspace(0, 1, len(x)), np.linspace(0, 1, len(pans)), pans)
    l, r = np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
    return np.stack([x * l * 1.414, x * r * 1.414], axis=1)


def _norm(y, peak=0.89):
    m = np.abs(y).max() + 1e-9
    return (y / m * peak).astype(np.float32)


def _sine_sweep(dur, f0, f1, curve="exp"):
    n = int(dur * SR)
    if curve == "exp":
        f = f0 * (f1 / f0) ** np.linspace(0, 1, n)
    else:
        f = np.linspace(f0, f1, n)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph)


# ----------------------------------------------------------------------------- sounds
def whoosh(dur=0.7, seed=1, lo=250, hi=4200, peak_at=0.55, pan=(-0.7, 0.7)):
    n = int(dur * SR)
    x = _pink(n, seed)
    k = np.linspace(0, 1, 64)
    fc = np.where(k < peak_at, lo * (hi / lo) ** (k / peak_at), hi * (lo * 1.6 / hi) ** ((k - peak_at) / (1 - peak_at)))
    y = _sweep_filter(x, fc, 1.3) * _env(n, peak_at, 1.6)
    wet = _reverb(y, 0.5, 0.15)[:, 0]
    return _norm(_panner(wet, pan))


def swish(seed=2):
    n = int(0.28 * SR)
    x = _rng(seed).standard_normal(n)
    y = _sweep_filter(x, np.geomspace(1800, 9000, 32), 1.0) * _env(n, 0.35, 2.2)
    return _norm(_panner(y, (0.4, -0.4)), 0.7)


def impact(seed=3, sub=52, dur=1.9):
    n = int(dur * SR)
    t = _t(dur)
    f = sub * (1 + 1.4 * np.exp(-t / 0.045))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * _expdec(n, 0.42)
    click = _hp(_rng(seed).standard_normal(n), 1500) * _expdec(n, 0.004) * 0.9
    thud = _bp(_rng(seed + 1).standard_normal(n), 90, 420) * _expdec(n, 0.07) * 1.4
    y = np.tanh(1.6 * (body + click + thud))
    st = _reverb(y, 1.6, 0.22, seed=seed)
    return _norm(st[:n + int(0.6 * SR)])


def boom(seed=4):
    n = int(2.8 * SR)
    t = _t(2.8)
    f = 44 * (1 + 2.0 * np.exp(-t / 0.08))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * _expdec(n, 0.9)
    rumble = _lp(_rng(seed).standard_normal(n), 160) * _expdec(n, 0.6) * 3
    crack = _bp(_rng(seed + 2).standard_normal(n), 800, 6000) * _expdec(n, 0.012)
    y = np.tanh(1.8 * (body + rumble + crack * 0.8))
    return _norm(_reverb(y, 2.2, 0.28, seed=seed))


def subdrop(seed=5, dur=1.6):
    n = int(dur * SR)
    y = _sine_sweep(dur, 110, 28) * _env(n, 0.03, 1.4)
    y += 0.25 * _sine_sweep(dur, 220, 56) * _env(n, 0.02, 2.5)
    return _norm(_stereo(np.tanh(1.3 * y)))


def riser(dur=2.0, seed=6):
    n = int(dur * SR)
    noise = _sweep_filter(_pink(n, seed), np.geomspace(300, 7500, 64), 1.1)
    tone = sum(np.sin(2 * np.pi * np.cumsum(f0 * 2 ** (2 * np.linspace(0, 1, n) ** 1.6)) / SR) for f0 in (110, 110 * 1.5, 220.7))
    g = np.linspace(0, 1, n) ** 2.2
    y = (noise * 1.0 + 0.18 * np.tanh(tone)) * g
    y[-int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))
    return _norm(_panner(y, (-0.3, 0.3, 0.0)))


def reverse_swell(dur=1.1, seed=8):
    y = impact(seed, 60, dur)[:, 0]
    y = y[: int(dur * SR)][::-1] * np.linspace(0, 1, int(dur * SR)) ** 1.5
    return _norm(_stereo(y), 0.8)


def pop(seed=9, f0=1100, f1=380):
    dur = 0.13
    n = int(dur * SR)
    y = _sine_sweep(dur, f0, f1) * _expdec(n, 0.03)
    y += _hp(_rng(seed).standard_normal(n), 3000) * _expdec(n, 0.002) * 0.4
    return _norm(_stereo(y), 0.7)


def tick(seed=10):
    n = int(0.06 * SR)
    y = _bp(_rng(seed).standard_normal(n), 1800, 6000) * _expdec(n, 0.003)
    y += np.sin(2 * np.pi * 2400 * _t(0.06)) * _expdec(n, 0.006) * 0.5
    return _norm(_stereo(y), 0.6)


def click(seed=11):
    n = int(0.045 * SR)
    y = _bp(_rng(seed).standard_normal(n), 2500, 9000) * _expdec(n, 0.0025)
    return _norm(_stereo(y), 0.55)


def key(seed=12):
    n = int(0.07 * SR)
    r = _rng(seed)
    y = _bp(r.standard_normal(n), 900 + r.random() * 600, 5000) * _expdec(n, 0.006)
    y += _bp(r.standard_normal(n), 120, 500) * _expdec(n, 0.012) * 0.6
    return _norm(_stereo(y, r.uniform(-0.3, 0.3)), 0.5)


def ding(f=1318.5, dur=1.6):
    n = int(dur * SR)
    t = _t(dur)
    y = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / d) for m, a, d in ((1, 1, 0.9), (2.76, 0.45, 0.35), (5.4, 0.25, 0.18), (8.93, 0.12, 0.09)))
    y[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return _norm(_reverb(y, 1.0, 0.2), 0.65)


def success():
    a = ding(1318.5, 0.9)
    b = ding(1975.5, 1.2)
    out = np.zeros((int(1.6 * SR), 2), np.float32)
    out[: len(a)] += a[: min(len(a), len(out))]
    o = int(0.11 * SR)
    m = min(len(b), len(out) - o)
    out[o:o + m] += b[:m]
    return _norm(out, 0.6)


def error():
    dur = 0.48
    n = int(dur * SR)
    t = _t(dur)
    sq = np.sign(np.sin(2 * np.pi * 116 * t)) + np.sign(np.sin(2 * np.pi * 123 * t))
    gate = ((t % 0.22) < 0.15).astype(float)
    y = _lp(sq, 1800) * gate * _env(n, 0.02, 0.6)
    return _norm(_stereo(y), 0.55)


def glitch(seed=13, dur=0.4):
    n = int(dur * SR)
    r = _rng(seed)
    y = np.zeros(n)
    pos = 0
    while pos < n:
        L = int(r.uniform(0.008, 0.05) * SR)
        kind = r.integers(0, 3)
        seg = np.arange(min(L, n - pos))
        if kind == 0:
            s = r.standard_normal(len(seg))
        elif kind == 1:
            s = np.sign(np.sin(2 * np.pi * r.uniform(200, 2400) * seg / SR))
        else:
            s = np.zeros(len(seg))
        y[pos:pos + len(seg)] = s * r.uniform(0.2, 1.0)
        pos += len(seg)
    y = np.round(y * 6) / 6  # bit-crush
    return _norm(_panner(_hp(y, 300) * _env(n, 0.05, 0.8), (-0.6, 0.6, -0.2)), 0.5)


def heartbeat():
    dur = 1.0
    n = int(dur * SR)
    t = _t(dur)

    def thump(at, f=58, amp=1.0):
        tt = np.clip(t - at, 0, None)
        return amp * np.sin(2 * np.pi * f * (1 + 0.6 * np.exp(-tt / 0.02)) * tt) * np.exp(-tt / 0.07) * (t >= at)

    y = thump(0.0) + thump(0.27, 52, 0.75)
    return _norm(_stereo(np.tanh(1.5 * _lp(y, 300))), 0.85)


def shimmer(seed=14, dur=1.6):
    n = int(dur * SR)
    r = _rng(seed)
    t = _t(dur)
    y = np.zeros(n)
    for _ in range(26):
        f = r.uniform(2800, 9500)
        at = r.uniform(0, dur * 0.65)
        tt = np.clip(t - at, 0, None)
        y += np.sin(2 * np.pi * f * tt) * np.exp(-tt / r.uniform(0.08, 0.35)) * (t >= at) * r.uniform(0.2, 1)
    y *= np.linspace(1, 0.6, n)
    return _norm(_reverb(y, 1.2, 0.35, seed=seed), 0.45)


def camera():
    n = int(0.3 * SR)
    y = np.zeros(n)
    for at, a in ((0.0, 1.0), (0.11, 0.7)):
        k = int(at * SR)
        m = n - k
        y[k:] += _bp(_rng(int(at * 100)).standard_normal(m), 1500, 7000) * _expdec(m, 0.006) * a
        y[k:] += _bp(_rng(int(at * 100) + 1).standard_normal(m), 200, 900) * _expdec(m, 0.02) * a * 0.6
    return _norm(_stereo(y), 0.6)


def stamp(seed=15):
    n = int(0.6 * SR)
    t = _t(0.6)
    y = np.sin(2 * np.pi * 70 * (1 + 0.8 * np.exp(-t / 0.015)) * t) * _expdec(n, 0.06)
    y += _bp(_rng(seed).standard_normal(n), 400, 3000) * _expdec(n, 0.018) * 0.8
    return _norm(_reverb(np.tanh(2 * y), 0.5, 0.12), 0.85)


def bass_hit(seed=16):
    n = int(0.9 * SR)
    t = _t(0.9)
    y = np.sin(2 * np.pi * np.cumsum(55 * (1 + 2.2 * np.exp(-t / 0.03))) / SR) * _expdec(n, 0.25)
    y += _hp(_rng(seed).standard_normal(n), 2000) * _expdec(n, 0.003) * 0.4
    return _norm(_stereo(np.tanh(1.8 * y)), 0.9)


def drip(seed=17):
    n = int(0.35 * SR)
    t = _t(0.35)
    f = 700 * (1 + 1.8 * (t / 0.035).clip(0, 1))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.045)
    return _norm(_reverb(y, 0.7, 0.3, seed=seed), 0.6)


def marker(seed=18):
    n = int(0.42 * SR)
    r = _rng(seed)
    y = _bp(r.standard_normal(n), 1500, 7000)
    am = 0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 23 * _t(0.42)))
    return _norm(_panner(y * am * _env(n, 0.1, 1.0), (-0.5, 0.5)), 0.4)


def counter_tick(seed=19):
    return tick(seed)


LIB = {
    "whoosh": lambda: whoosh(0.7, 1),
    "whoosh2": lambda: whoosh(0.6, 21, 400, 5200, 0.5, (0.7, -0.7)),
    "whoosh_long": lambda: whoosh(1.3, 22, 180, 3600, 0.62, (-0.9, 0.9)),
    "swish": swish,
    "impact": impact,
    "impact_soft": lambda: impact(31, 60, 1.2) * 0.6,
    "boom": boom,
    "subdrop": subdrop,
    "riser": lambda: riser(2.0),
    "riser_short": lambda: riser(1.0, 61),
    "riser_long": lambda: riser(3.0, 62),
    "reverse_swell": reverse_swell,
    "pop": pop,
    "pop_low": lambda: pop(91, 700, 220),
    "tick": tick,
    "click": click,
    "key": key,
    "ding": ding,
    "success": success,
    "error": error,
    "glitch": glitch,
    "heartbeat": heartbeat,
    "shimmer": shimmer,
    "camera": camera,
    "stamp": stamp,
    "bass_hit": bass_hit,
    "drip": drip,
    "marker": marker,
}

_cache = {}


def get(name):
    if name not in _cache:
        if name not in LIB:
            raise KeyError(f"unknown sfx '{name}'. available: {', '.join(sorted(LIB))}")
        y = np.asarray(LIB[name](), dtype=np.float32)
        if y.ndim == 1:
            y = np.stack([y, y], axis=1)
        _cache[name] = y
    return _cache[name]


if __name__ == "__main__":
    import soundfile as sf
    ap = argparse.ArgumentParser()
    ap.add_argument("--render", default=None)
    a = ap.parse_args()
    if a.render:
        os.makedirs(a.render, exist_ok=True)
        for k in LIB:
            y = get(k)
            sf.write(os.path.join(a.render, f"{k}.wav"), y, SR)
            print(f"{k:14s} {len(y) / SR:5.2f}s  peak {np.abs(y).max():.2f}")
