#!/usr/bin/env python3
"""Procedural cinematic underscore (no samples): soft piano-like motif over a dark
pad and a slow pulse. Deliberately sparse — it sits under a voice-over.

Moods
    dark_piano   minor-key piano + warm pad + slow sub pulse   (psychology / reflective)
    tension      drone + ticking pulse + rising swells          (manipulation / warnings)
    uplift       major-ish pad + brighter arpeggio              (resolution / hopeful endings)

A script can request sections: [{"t": 0, "mood": "tension"}, {"t": 41.2, "mood": "uplift"}]
"""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000


def _lp(x, f, o=2):
    return sosfilt(butter(o, f, btype="low", fs=SR, output="sos"), x)


def _hp(x, f, o=2):
    return sosfilt(butter(o, f, btype="high", fs=SR, output="sos"), x)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def piano_note(f, dur, vel=0.6, seed=0):
    """additive 'felt piano': inharmonic partials, fast attack, two-stage decay, hammer noise."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    B = 0.00025  # inharmonicity
    y = np.zeros(n)
    for k in range(1, 9):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > 9000:
            break
        amp = (1.0 / k ** 1.25) * (0.9 if k == 1 else 1.0)
        dec = (2.8 / (1 + 0.55 * (k - 1))) * (220 / max(f, 60)) ** 0.35
        y += amp * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * (0.65 * np.exp(-t / (dec * 0.18)) + 0.35 * np.exp(-t / dec))
    att = int(0.004 * SR)
    y[:att] *= np.linspace(0, 1, att)
    hammer = _hp(rng.standard_normal(n), 1200) * np.exp(-t / 0.006) * 0.08
    y = (y + hammer) * vel
    rel = int(0.25 * SR)
    if n > rel:
        y[-rel:] *= np.linspace(1, 0, rel)
    return _lp(y, 2600 + 3000 * vel)


def pad(freqs, dur, bright=900, seed=1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    y = np.zeros(n)
    for f in freqs:
        for det in (-0.11, 0.0, 0.13):
            ff = f * 2 ** (det / 12)
            ph = rng.uniform(0, 6.28)
            saw = sum(np.sin(2 * np.pi * ff * k * t + ph * k) / k for k in range(1, 7))
            y += saw
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t + 1.0)
    y = _lp(y, bright, 2) * (0.75 + 0.25 * lfo)
    a = int(min(1.2, dur / 3) * SR)
    y[:a] *= np.linspace(0, 1, a) ** 2
    y[-a:] *= np.linspace(1, 0, a) ** 2
    return y / (np.abs(y).max() + 1e-9)


def kick(dur=0.6, f=48):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * np.cumsum(f * (1 + 1.5 * np.exp(-t / 0.03))) / SR) * np.exp(-t / 0.18)
    return np.tanh(1.4 * y)


def tick_hat(seed):
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return _hp(np.random.default_rng(seed).standard_normal(n), 6000) * np.exp(-t / 0.008)


def _reverb_st(x, seconds=2.8, mix=0.35, seed=3):
    n = int(seconds * SR)
    rng = np.random.default_rng(seed)
    out = []
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (seconds * SR / 6.0))
        ir = _lp(ir, 4500, 2)
        ir /= np.sqrt((ir ** 2).sum()) + 1e-9
        out.append(fftconvolve(x, ir)[: len(x)])
    wet = np.stack(out, axis=1)
    return np.stack([x, x], axis=1) * (1 - mix) + wet * mix


# chord progressions (MIDI roots + voicings), 4 beats per chord
PROG = {
    "dark_piano": [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [36, 43, 48, 52, 55], [43, 50, 55, 59, 62]],  # Am F C G (i VI III VII)
    "tension": [[38, 45, 50, 53], [38, 45, 50, 51], [36, 43, 48, 51], [37, 44, 49, 52]],
    "uplift": [[41, 48, 53, 57, 60], [36, 43, 48, 52, 55], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64]],  # F C G Am
}


def render(duration, sections=None, bpm=72, seed=7):
    """returns stereo float32 (n,2) normalised to ~-1 dBFS peak."""
    sections = sections or [{"t": 0.0, "mood": "dark_piano"}]
    sections = sorted(sections, key=lambda s: s["t"])
    n = int(duration * SR) + SR
    out = np.zeros(n)
    hats = np.zeros(n)
    beat = 60.0 / bpm
    bar = 4 * beat
    rng = np.random.default_rng(seed)

    def mood_at(t):
        m = sections[0]["mood"]
        for s in sections:
            if t >= s["t"]:
                m = s["mood"]
        return m

    t = 0.0
    bar_i = 0
    while t < duration:
        mood = mood_at(t)
        chord = PROG[mood][bar_i % 4]
        # pad
        p = pad([midi(c) for c in chord[:3]], bar * 1.15, 700 if mood != "uplift" else 1100, seed=bar_i)
        a = int(t * SR)
        out[a:a + len(p)] += 0.22 * p[: max(0, n - a)]
        # piano motif: sparse arpeggio, more notes in uplift
        pattern = {"dark_piano": [0, 2, 3, 4], "tension": [0, 3], "uplift": [0, 1, 2, 3, 4, 2]}[mood]
        step = bar / len(pattern)
        for k, idx in enumerate(pattern):
            note = chord[idx % len(chord)] + 12
            if mood == "tension" and k == 1:
                note += 1  # minor-second rub
            pn = piano_note(midi(note), 3.0, vel=0.42 + 0.12 * rng.random(), seed=bar_i * 10 + k)
            b0 = int((t + k * step + rng.uniform(0, 0.015)) * SR)
            m = min(len(pn), n - b0)
            if m > 0:
                out[b0:b0 + m] += 0.30 * pn[:m]
        # pulse
        if mood in ("tension", "dark_piano"):
            for k in range(4 if mood == "tension" else 2):
                kk = kick(0.6, 46)
                b0 = int((t + k * (bar / (4 if mood == "tension" else 2))) * SR)
                m = min(len(kk), n - b0)
                if m > 0:
                    out[b0:b0 + m] += (0.30 if mood == "tension" else 0.18) * kk[:m]
        if mood == "tension":
            for k in range(8):
                hh = tick_hat(bar_i * 8 + k)
                b0 = int((t + k * bar / 8) * SR)
                m = min(len(hh), n - b0)
                if m > 0:
                    hats[b0:b0 + m] += (0.05 if k % 2 else 0.08) * hh[:m]
        t += bar
        bar_i += 1

    st = _reverb_st(out[: int(duration * SR)], 3.2, 0.38)
    st[:, 0] += hats[: len(st)] * 0.8
    st[:, 1] += hats[: len(st)] * 1.0
    fade = int(1.5 * SR)
    st[-fade:] *= np.linspace(1, 0, fade)[:, None]
    st /= np.abs(st).max() + 1e-9
    return (st * 0.89).astype(np.float32)


if __name__ == "__main__":
    import soundfile as sf
    import sys
    y = render(30, [{"t": 0, "mood": "dark_piano"}, {"t": 13.3, "mood": "tension"}, {"t": 23, "mood": "uplift"}])
    sf.write(sys.argv[1] if len(sys.argv) > 1 else "music_preview.wav", y, SR)
    print("ok", y.shape)
