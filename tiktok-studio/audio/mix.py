#!/usr/bin/env python3
"""Final audio mix: voice-over chain + SFX cues + ducked music bed -> loudness-normalised master.

    python3 audio/mix.py videos/<id>            # writes build/mix.wav and build/mix_nomusic.wav

Voice chain: high-pass, gentle presence lift, de-harsh, compression, limiter.
Music is side-chain ducked under the voice. Master: -14 LUFS integrated, ~-1 dBTP.
"""
import argparse
import json
import os
import sys

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import music as music_mod  # noqa: E402
import sfx as sfx_lib  # noqa: E402

SR = 48000


def db(x):
    return 10 ** (x / 20)


def peq(x, f, gain_db, q=0.9):
    """RBJ peaking EQ biquad."""
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f / SR
    alpha = np.sin(w0) / (2 * q)
    b = np.array([1 + alpha * A, -2 * np.cos(w0), 1 - alpha * A])
    a = np.array([1 + alpha / A, -2 * np.cos(w0), 1 - alpha / A])
    from scipy.signal import lfilter
    return lfilter(b / a[0], a / a[0], x)


def compress(x, thresh_db=-20, ratio=3.0, attack=0.005, release=0.12, makeup_db=0.0):
    # envelope follower on |x| (mono or stereo-linked)
    mono = np.abs(x) if x.ndim == 1 else np.abs(x).max(axis=1)
    hop = 48
    m = mono[: len(mono) // hop * hop].reshape(-1, hop).max(axis=1)
    env = np.zeros_like(m)
    a_att, a_rel = np.exp(-hop / (attack * SR)), np.exp(-hop / (release * SR))
    e = 0.0
    for i, v in enumerate(m):
        e = a_att * e + (1 - a_att) * v if v > e else a_rel * e + (1 - a_rel) * v
        env[i] = e
    lvl = 20 * np.log10(env + 1e-9)
    over = np.maximum(0, lvl - thresh_db)
    gr = -over * (1 - 1 / ratio) + makeup_db
    g = np.repeat(db(gr), hop)
    g = np.pad(g, (0, len(x) - len(g)), mode="edge")
    return x * (g if x.ndim == 1 else g[:, None])


def limiter(x, ceiling_db=-1.0, lookahead=0.005, release=0.06):
    ceil = db(ceiling_db)
    peak = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    la = int(lookahead * SR)
    # required gain per sample, then min-filter over lookahead and smooth release
    need = np.minimum(1.0, ceil / (peak + 1e-12))
    from scipy.ndimage import minimum_filter1d
    need = minimum_filter1d(need, size=2 * la + 1)
    g = np.empty_like(need)
    a_rel = np.exp(-1 / (release * SR))
    cur = 1.0
    for i, v in enumerate(need):
        cur = v if v < cur else a_rel * cur + (1 - a_rel) * v
        g[i] = cur
    y = x * (g[:, None] if x.ndim == 2 else g)
    # true-peak safety via 4x oversampled check
    up = resample_poly(y, 4, 1, axis=0)
    tp = np.abs(up).max()
    if tp > ceil:
        y *= ceil / tp
    return y


def voice_chain(v):
    v = sosfilt(butter(2, 75, btype="high", fs=SR, output="sos"), v)
    v = peq(v, 180, 1.5, 0.8)      # a little chest
    v = peq(v, 3200, 2.5, 0.9)     # presence / intelligibility on phones
    v = peq(v, 7200, -2.0, 1.4)    # tame sibilance
    v = compress(v, -22, 3.2, 0.004, 0.14, 4.0)
    return v


def duck_curve(vo, depth_db=-11.0, attack=0.06, release=0.45):
    hop = 480
    m = np.abs(vo[: len(vo) // hop * hop]).reshape(-1, hop).max(axis=1)
    active = (m > db(-38)).astype(float)
    env = np.zeros_like(active)
    a_att, a_rel = np.exp(-hop / (attack * SR)), np.exp(-hop / (release * SR))
    e = 0.0
    for i, v in enumerate(active):
        e = a_att * e + (1 - a_att) * v if v > e else a_rel * e + (1 - a_rel) * v
        env[i] = e
    g = db(depth_db * env)
    g = np.repeat(g, hop)
    return np.pad(g, (0, len(vo) - len(g)), mode="edge")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video_dir")
    ap.add_argument("--music-db", type=float, default=None, help="music bed level relative to voice (dB)")
    ap.add_argument("--lufs", type=float, default=-14.0)
    a = ap.parse_args()

    vdir = os.path.abspath(a.video_dir)
    bdir = os.path.join(vdir, "build")
    tl = json.load(open(os.path.join(bdir, "timeline.json"), encoding="utf-8"))
    vo, sr = sf.read(os.path.join(bdir, "vo.wav"), dtype="float32")
    assert sr == SR
    n = len(vo)
    vo = voice_chain(vo.astype(np.float64))
    vo_st = np.stack([vo, vo], axis=1)

    # SFX bus
    fx = np.zeros((n + 6 * SR, 2))
    for c in tl.get("sfx", []):
        s = sfx_lib.get(c["name"]).astype(np.float64) * db(c.get("gain", 0.0) - 6.0)
        i = int(c["t"] * SR)
        m = min(len(s), len(fx) - i)
        if m > 0 and i >= 0:
            fx[i:i + m] += s[:m]
    fx = fx[:n]

    # music bed
    mcfg = tl.get("music") or {}
    music_db = a.music_db if a.music_db is not None else mcfg.get("db", -17.0)
    mus = music_mod.render(n / SR, mcfg.get("sections"), mcfg.get("bpm", 72), mcfg.get("seed", 7)).astype(np.float64)
    mus = mus[:n] if len(mus) >= n else np.pad(mus, ((0, n - len(mus)), (0, 0)))
    mus *= duck_curve(vo)[:, None] * db(music_db)

    def master(parts):
        mix = sum(parts)
        mix = compress(mix, -16, 2.0, 0.01, 0.2, 0.0)
        meter = pyln.Meter(SR)
        loud = meter.integrated_loudness(mix)
        out = mix
        for _ in range(3):  # gain -> limit -> re-measure, so the limiter can't leave us under target
            out = limiter(mix * db(a.lufs - loud), -1.2)
            got = meter.integrated_loudness(out)
            if abs(got - a.lufs) < 0.3:
                break
            loud -= (a.lufs - got)
        return out.astype(np.float32), loud

    full, l1 = master([vo_st, fx * 0.9, mus])
    sf.write(os.path.join(bdir, "mix.wav"), full, SR, subtype="PCM_24")
    nomus, l2 = master([vo_st, fx * 0.9])
    sf.write(os.path.join(bdir, "mix_nomusic.wav"), nomus, SR, subtype="PCM_24")
    meter = pyln.Meter(SR)
    print(f"mix.wav  {pyln.Meter(SR).integrated_loudness(full):.1f} LUFS  peak {20*np.log10(np.abs(full).max()+1e-9):.1f} dBFS  "
          f"({len(tl.get('sfx', []))} sfx cues, music {music_db:+.0f} dB)")


if __name__ == "__main__":
    main()
