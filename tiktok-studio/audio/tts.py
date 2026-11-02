#!/usr/bin/env python3
"""Voice-over + timeline builder.

Reads videos/<id>/script.json, voices every beat, and writes
    videos/<id>/build/vo.wav           48 kHz mono voice-over
    videos/<id>/build/timeline.json    beats, per-word timings, resolved SFX cues

Providers
    elevenlabs  ElevenLabs API, /with-timestamps (character-level alignment).
                Needs ELEVENLABS_API_KEY and network access to api.elevenlabs.io.
    kokoro      Local Kokoro-82M ONNX (Apache-2.0) with phoneme durations.
                Needs the model files (see README) in $KOKORO_DIR.

    python3 audio/tts.py videos/us01_black_tar [--provider kokoro|elevenlabs]
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

SR = 48000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_KOKORO_DIR = os.environ.get("KOKORO_DIR", os.path.join(ROOT, ".models"))

STRESS = set("ˈˌːˑ")
PUNCT = set(",.!?;:—–…-\"'“”«»()¿¡")


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ----------------------------------------------------------------------------- words
def split_words(text):
    """Whitespace tokens, keeping attached punctuation (the renderer strips it)."""
    return [w for w in text.split() if w.strip()]


def plen(s):
    return sum(1 for c in s if c not in STRESS and c not in PUNCT and not c.isspace())


def align_words(word_lens, groups):
    """Monotonic DP alignment of text words to phoneme groups.

    Allows one word -> k groups (numbers like 3,150 read as several words) and
    m words -> one group (espeak merges e.g. "out of"). Returns [(start, end)].
    """
    W, G = len(word_lens), len(groups)
    if W == 0:
        return []
    if G == 0:
        return [(0.0, 0.0)] * W
    g_lens = [g["n"] for g in groups]
    INF = float("inf")
    dp = [[INF] * (G + 1) for _ in range(W + 1)]
    bt = [[None] * (G + 1) for _ in range(W + 1)]
    dp[0][0] = 0.0
    for i in range(W + 1):
        for j in range(G + 1):
            if dp[i][j] == INF:
                continue
            if i < W:
                for k in range(1, 13):
                    if j + k > G:
                        break
                    gl, wl = sum(g_lens[j:j + k]), word_lens[i]
                    c = dp[i][j] + abs(gl - wl) / max(gl, wl, 1) + 0.12 * (k - 1)
                    if c < dp[i + 1][j + k]:
                        dp[i + 1][j + k], bt[i + 1][j + k] = c, (i, j, 1, k)
            if j < G:
                for m in range(2, 5):
                    if i + m > W:
                        break
                    wl, gl = sum(word_lens[i:i + m]), g_lens[j]
                    c = dp[i][j] + abs(gl - wl) / max(gl, wl, 1) + 0.12 * (m - 1)
                    if c < dp[i + m][j + 1]:
                        dp[i + m][j + 1], bt[i + m][j + 1] = c, (i, j, m, 1)
    if dp[W][G] == INF:
        # proportional fallback
        t0, t1 = groups[0]["start"], groups[-1]["end"]
        tot, acc, out = sum(word_lens) or 1, 0, []
        for wl in word_lens:
            a = t0 + (t1 - t0) * acc / tot
            acc += wl
            out.append((a, t0 + (t1 - t0) * acc / tot))
        return out
    segs, i, j = [], W, G
    while i > 0 or j > 0:
        pi, pj, m, k = bt[i][j]
        segs.append((pi, m, pj, k))
        i, j = pi, pj
    segs.reverse()
    out = [None] * W
    for wi, m, gj, k in segs:
        a, b = groups[gj]["start"], groups[gj + k - 1]["end"]
        if m == 1:
            out[wi] = (a, b)
        else:
            tot, acc = sum(word_lens[wi:wi + m]) or 1, 0
            for q in range(m):
                s = a + (b - a) * acc / tot
                acc += word_lens[wi + q]
                out[wi + q] = (s, a + (b - a) * acc / tot)
    return out


# ----------------------------------------------------------------------------- audio utils
def to_sr(audio, sr):
    audio = np.asarray(audio, dtype=np.float32)
    if sr == SR:
        return audio
    from math import gcd
    g = gcd(sr, SR)
    return resample_poly(audio, SR // g, sr // g).astype(np.float32)


def decode_with_ffmpeg(data: bytes):
    p = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", str(SR), "pipe:1"],
                       input=data, stdout=subprocess.PIPE, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def trim_silence(audio, words, thresh_db=-48.0, keep=0.03):
    """Trim leading/trailing silence (keeping `keep` s) and shift word times."""
    if len(audio) == 0:
        return audio, words
    hop = int(0.005 * SR)
    frames = np.abs(audio[: len(audio) // hop * hop]).reshape(-1, hop).max(axis=1) + 1e-9
    db = 20 * np.log10(frames)
    voiced = np.where(db > thresh_db)[0]
    if len(voiced) == 0:
        return audio, words
    a = max(0, voiced[0] * hop - int(keep * SR))
    b = min(len(audio), (voiced[-1] + 1) * hop + int(keep * SR))
    if words:  # never cut into a word
        a = min(a, int(max(0.0, words[0]["s"] - 0.01) * SR))
        b = max(b, int((words[-1]["e"] + 0.01) * SR))
    shift = a / SR
    out = [{"w": w["w"], "s": round(max(0.0, w["s"] - shift), 3), "e": round(max(0.0, w["e"] - shift), 3)} for w in words]
    return audio[a:b], out


# ----------------------------------------------------------------------------- providers
class KokoroProvider:
    name = "kokoro"

    def __init__(self, cfg, lang):
        from kokoro_onnx import Kokoro
        d = cfg.get("kokoro_dir") or DEFAULT_KOKORO_DIR
        model = os.path.join(d, "kokoro-timed.onnx")
        voices = os.path.join(d, "voices.bin")
        if not os.path.exists(model):
            raise SystemExit(f"Kokoro model not found in {d} (see README: models)")
        self.k = Kokoro(model, voices)
        if not self.k.has_timings:
            raise SystemExit("This Kokoro export has no duration output; download model-files-v1.1")
        self.lang = cfg.get("kokoro_lang") or {"en-US": "en-us", "en-GB": "en-gb", "fr-FR": "fr-fr"}.get(lang, "en-us")
        v = cfg.get("kokoro_voice", "am_michael")
        if "+" in v or ":" in v:  # blend, e.g. "am_michael:0.6+am_fenrir:0.4"
            vec = None
            for part in v.split("+"):
                n, wt = part.split(":")
                s = self.k.get_voice_style(n) * float(wt)
                vec = s if vec is None else vec + s
            self.voice = vec
        else:
            self.voice = v
        self.speed = float(cfg.get("kokoro_speed", cfg.get("speed", 1.0)))
        self.label = f"kokoro:{v}@{self.speed}"

    def synth(self, text, prev_text=None, next_text=None):
        audio, sr, timings = self.k.create_timed(text, voice=self.voice, speed=self.speed, lang=self.lang)
        groups, cur = [], []
        for t in timings:
            p = t.phoneme
            if p.isspace() or p in PUNCT:
                if cur:
                    groups.append(cur)
                    cur = []
                continue
            cur.append(t)
        if cur:
            groups.append(cur)
        groups = [{"start": g[0].start, "end": g[-1].end, "n": max(1, plen("".join(x.phoneme for x in g)))} for g in groups]
        words = split_words(text)
        lens = []
        for w in words:
            core = re.sub(r"[^\w'’,.%+-]", "", w).strip(",.")
            ph = self.k.tokenizer.phonemize(core, self.lang) if core else ""
            lens.append(max(1, plen(ph)) if core else 0)
        # words with no phonemes (e.g. "—") ride along with their neighbour
        idx = [i for i, n in enumerate(lens) if n > 0]
        spans = align_words([lens[i] for i in idx], groups)
        out, last = [], 0.0
        it = iter(spans)
        for i, w in enumerate(words):
            if lens[i] > 0:
                s, e = next(it)
                last = e
            else:
                s = e = last
            out.append({"w": w, "s": round(s, 3), "e": round(e, 3)})
        return to_sr(audio, sr), out


class ElevenLabsProvider:
    name = "elevenlabs"
    API = "https://api.elevenlabs.io/v1"

    def __init__(self, cfg, lang):
        import requests
        key = os.environ.get("ELEVENLABS_API_KEY") or os.environ.get("XI_API_KEY")
        if not key:
            raise SystemExit("ELEVENLABS_API_KEY is not set. Add it to the environment (Network secrets) and start a new session.")
        self.s = requests.Session()
        self.s.headers.update({"xi-api-key": key, "Content-Type": "application/json"})
        self.model = cfg.get("el_model", "eleven_multilingual_v2")
        self.fmt = cfg.get("el_format", "mp3_44100_128")
        self.settings = cfg.get("el_settings", {"stability": 0.42, "similarity_boost": 0.82, "style": 0.28, "use_speaker_boost": True, "speed": 1.0})
        self.voice_id = cfg.get("el_voice_id") or self._lookup(cfg.get("el_voice_name", "Brian"))
        self.lang = lang
        self.label = f"elevenlabs:{self.voice_id}:{self.model}"

    def _lookup(self, name):
        r = self.s.get(f"{self.API}/voices", timeout=60)
        r.raise_for_status()
        voices = r.json().get("voices", [])
        for v in voices:
            if v["name"].lower() == name.lower() or v["name"].lower().startswith(name.lower() + " "):
                log(f"elevenlabs voice '{v['name']}' -> {v['voice_id']}")
                return v["voice_id"]
        names = ", ".join(sorted(v["name"] for v in voices))
        raise SystemExit(f"ElevenLabs voice '{name}' not in your account. Available: {names}")

    def synth(self, text, prev_text=None, next_text=None):
        body = {"text": text, "model_id": self.model, "voice_settings": self.settings}
        if prev_text:
            body["previous_text"] = prev_text
        if next_text:
            body["next_text"] = next_text
        r = self.s.post(f"{self.API}/text-to-speech/{self.voice_id}/with-timestamps",
                        params={"output_format": self.fmt}, json=body, timeout=180)
        if r.status_code != 200:
            raise SystemExit(f"ElevenLabs error {r.status_code}: {r.text[:400]}")
        j = r.json()
        audio = decode_with_ffmpeg(base64.b64decode(j["audio_base64"]))
        al = j.get("alignment") or j.get("normalized_alignment")
        chars, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
        words, cur, cs, ce = [], "", None, None
        for ch, a, b in zip(chars, st, en):
            if ch.isspace():
                if cur:
                    words.append({"w": cur, "s": round(cs, 3), "e": round(ce, 3)})
                cur, cs, ce = "", None, None
                continue
            if cs is None:
                cs = a
            cur += ch
            ce = b
        if cur:
            words.append({"w": cur, "s": round(cs, 3), "e": round(ce, 3)})
        return audio, words


# ----------------------------------------------------------------------------- build
def resolve_cue(cue, beat):
    at = str(cue.get("at", "start"))
    off = float(cue.get("offset", 0.0))
    if at == "start":
        t = beat["start"]
    elif at == "end":
        t = beat["end"]
    elif at.startswith("word:"):
        key, nth = (at[5:].split("#") + ["1"])[:2]
        k = re.sub(r"[^\w'’+%]", "", key.lower())
        t, seen = beat["start"], 0
        for w in beat["words"]:
            if re.sub(r"[^\w'’+%]", "", w["w"].lower()).startswith(k):
                seen += 1
                if seen == int(nth):
                    t = w["s"]
                    break
        else:
            log(f"  ! cue word '{key}' not found in beat {beat['id']}")
    else:
        t = beat["start"] + float(at)
    return round(max(0.0, t + off), 3)


def resolve_music(m, beats):
    """music sections may be pinned to a beat: {"beat": "freedom", "offset": -0.2, "mood": "uplift"}"""
    m = dict(m or {})
    by_id = {b["id"]: b for b in beats}
    secs = []
    for s in m.get("sections", []):
        s = dict(s)
        if "beat" in s and s["beat"] in by_id:
            s["t"] = round(by_id[s["beat"]]["start"] + float(s.get("offset", 0.0)), 3)
        secs.append(s)
    if secs:
        m["sections"] = secs
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video_dir")
    ap.add_argument("--provider", default=None, help="override script voice.provider")
    args = ap.parse_args()

    vdir = os.path.abspath(args.video_dir)
    script = json.load(open(os.path.join(vdir, "script.json"), encoding="utf-8"))
    vcfg = dict(script.get("voice", {}))
    provider = args.provider or os.environ.get("TTS_PROVIDER") or vcfg.get("provider", "kokoro")
    if provider == "elevenlabs" and not (os.environ.get("ELEVENLABS_API_KEY") or os.environ.get("XI_API_KEY")):
        fb = vcfg.get("fallback", "kokoro")
        log(f"ELEVENLABS_API_KEY not set -> falling back to {fb}")
        provider = fb
    lang = script.get("lang", "en-US")
    tts = ElevenLabsProvider(vcfg, lang) if provider == "elevenlabs" else KokoroProvider(vcfg, lang)
    log(f"voice: {tts.label}")

    bdir = os.path.join(vdir, "build")
    os.makedirs(bdir, exist_ok=True)
    cache_dir = os.path.join(bdir, "tts_cache")
    os.makedirs(cache_dir, exist_ok=True)

    beats = script["beats"]
    t = float(script.get("lead_in", 0.12))
    default_pause = float(script.get("pause", 0.16))
    chunks, out_beats, cues = [], [], []
    for i, b in enumerate(beats):
        text = b.get("vo", "").strip()
        start = t
        words = []
        if text:
            import hashlib
            h = hashlib.sha1(json.dumps([tts.label, text, vcfg.get("el_settings")], sort_keys=True).encode()).hexdigest()[:16]
            cpath, jpath = os.path.join(cache_dir, f"{h}.wav"), os.path.join(cache_dir, f"{h}.json")
            if os.path.exists(cpath) and os.path.exists(jpath):
                audio, _ = sf.read(cpath, dtype="float32")
                words = json.load(open(jpath))
            else:
                prev_text = beats[i - 1].get("vo") if i > 0 else None
                next_text = beats[i + 1].get("vo") if i + 1 < len(beats) else None
                audio, words = tts.synth(text, prev_text, next_text)
                audio, words = trim_silence(audio, words)
                sf.write(cpath, audio, SR)
                json.dump(words, open(jpath, "w"))
            log(f"  {b['id']:<14} {len(audio) / SR:5.2f}s  {text[:70]}")
            chunks.append((start, audio))
            dur = len(audio) / SR
        else:
            dur = float(b.get("hold", 1.0))
        end = start + dur
        ob = {k: v for k, v in b.items() if k not in ("vo", "sfx", "notes")}
        ob.update({"id": b["id"], "text": text, "start": round(start, 3), "end": round(end, 3),
                   "words": [{"w": w["w"], "s": round(start + w["s"], 3), "e": round(start + w["e"], 3)} for w in words]})
        out_beats.append(ob)
        for c in b.get("sfx", []):
            cues.append({"t": resolve_cue(c, ob), "name": c["name"], "gain": c.get("gain", 0.0), "beat": b["id"]})
        t = end + float(b.get("pause_after", default_pause))
    duration = t + float(script.get("tail", 0.8))

    vo = np.zeros(int(duration * SR) + SR, dtype=np.float32)
    for start, audio in chunks:
        a = int(start * SR)
        vo[a:a + len(audio)] += audio
    vo = vo[: int(duration * SR)]
    sf.write(os.path.join(bdir, "vo.wav"), vo, SR, subtype="FLOAT")

    timeline = {
        "id": script.get("id"), "lang": lang, "fps": script.get("fps", 30), "duration": round(duration, 3),
        "voice": tts.label, "beats": out_beats, "sfx": sorted(cues, key=lambda c: c["t"]),
        "music": resolve_music(script.get("music", {}), out_beats),
    }
    json.dump(timeline, open(os.path.join(bdir, "timeline.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log(f"duration {duration:.2f}s, {len(out_beats)} beats, {len(cues)} sfx cues -> {bdir}")


if __name__ == "__main__":
    main()
