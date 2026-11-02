#!/usr/bin/env python3
"""Write renders/MANIFEST.md (id, commit, voice, duration, frames, size, LUFS, true peak) for every
master in renders/ and refresh the length column of the README video table.

    python3 tools/manifest.py
"""
import glob
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True).stdout


def probe(path):
    j = json.loads(sh(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]))
    v = next(s for s in j["streams"] if s["codec_type"] == "video")
    return float(j["format"]["duration"]), int(v.get("nb_frames", 0)), int(j["format"]["size"])


def loudness(path):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128=peak=true", "-vn", "-f", "null", "-"], capture_output=True, text=True).stderr
    lufs = re.search(r"I:\s+(-?[0-9.]+) LUFS", err)
    tp = re.findall(r"Peak:\s+(-?[0-9.]+) dBFS", err)
    return (float(lufs.group(1)) if lufs else None), (float(tp[-1]) if tp else None)


def mmss(s):
    return f"{int(s // 60)}:{int(round(s % 60)):02d}"


def main():
    commit = sh(["git", "-C", ROOT, "rev-parse", "--short", "HEAD"]).strip()
    rows = []
    for path in sorted(glob.glob(os.path.join(ROOT, "renders", "*__*.mp4"))):
        name = os.path.basename(path)
        if "__nomusic" in name:
            continue
        vid, provider = name[:-4].split("__")[:2]
        tl_path = os.path.join(ROOT, "videos", vid, "build", "timeline.json")
        voice = json.load(open(tl_path))["voice"] if os.path.exists(tl_path) else provider
        dur, frames, size = probe(path)
        lufs, tp = loudness(path)
        rows.append((vid, name, voice, dur, frames, size, lufs, tp))
    out = ["# Render manifest", "", f"Built from commit `{commit}`. Masters are 1080×1920, 30 fps, H.264 CRF 17 + AAC 256k; `__web` copies are CRF 22 for the repo; `__nomusic` twins carry voice + SFX only.", "",
           "| Video | File | Voice | Length | Frames | Size | Loudness | True peak |", "|---|---|---|---|---|---|---|---|"]
    for vid, name, voice, dur, frames, size, lufs, tp in rows:
        out.append(f"| {vid} | `{name}` | {voice} | {mmss(dur)} ({dur:.2f} s) | {frames} | {size / 1e6:.1f} MB | {lufs:.1f} LUFS | {tp:.1f} dBTP |")
    open(os.path.join(ROOT, "renders", "MANIFEST.md"), "w").write("\n".join(out) + "\n")
    # README length column
    rp = os.path.join(ROOT, "README.md")
    readme = open(rp, encoding="utf-8").read()
    for vid, name, voice, dur, *_ in rows:
        if name.endswith("__web.mp4"):
            continue
        readme = re.sub(rf"(\| `videos/{re.escape(vid)}` \| [^|]+\| )[^|]+(\|)", rf"\g<1>{mmss(dur)} \g<2>", readme)
    open(rp, "w", encoding="utf-8").write(readme)
    print("\n".join(out))


if __name__ == "__main__":
    main()
