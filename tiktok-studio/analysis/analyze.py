#!/usr/bin/env python3
"""Competitor deep-dive: download every video of a TikTok account and measure what makes
it work — hook frames, cut rate, pacing, loudness, transcript, engagement — into a report.

    # needs network access to www.tiktok.com + TikTok CDNs (environment allowlist)
    python3 analysis/analyze.py --profile https://www.tiktok.com/@orythum --max 60
    # or analyse videos you downloaded yourself (put .mp4 files in a folder)
    python3 analysis/analyze.py --folder ~/Downloads/orythum --handle orythum

Optional transcription: pip install faster-whisper (model download needs huggingface.co).
Outputs: analysis/out/<handle>/{report.md, data.json, sheets/*.jpg, hooks/*.jpg}
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def probe(path):
    r = sh(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path])
    j = json.loads(r.stdout or "{}")
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video"), {})
    num, den = (v.get("avg_frame_rate", "30/1").split("/") + ["1"])[:2]
    return {
        "duration": float(j.get("format", {}).get("duration", 0) or 0),
        "w": v.get("width"), "h": v.get("height"),
        "fps": round(float(num) / max(1.0, float(den or 1)), 2) if num else None,
        "has_audio": any(s.get("codec_type") == "audio" for s in j.get("streams", [])),
    }


def scene_cuts(path, thresh=0.32):
    r = sh(["ffmpeg", "-hide_banner", "-i", path, "-vf", f"select='gt(scene,{thresh})',showinfo", "-an", "-f", "null", "-"])
    return [round(float(m), 3) for m in re.findall(r"pts_time:([0-9.]+)", r.stderr)]


def loudness(path):
    r = sh(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128=peak=true", "-vn", "-f", "null", "-"])
    m = re.search(r"Integrated loudness:\s+I:\s+(-?[0-9.]+) LUFS", r.stderr)
    return float(m.group(1)) if m else None


def frames(path, times, out_prefix):
    outs = []
    for t in times:
        o = f"{out_prefix}_{t:05.1f}s.jpg"
        sh(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", path, "-frames:v", "1", "-vf", "scale=360:-2", o])
        if os.path.exists(o):
            outs.append(o)
    return outs


def contact_sheet(path, dur, out, cols=6, every=None):
    every = every or max(1.0, dur / 24)
    n = int(dur // every) + 1
    rows = (n + cols - 1) // cols
    sh(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-vf",
        f"fps=1/{every:.3f},scale=240:-2,drawtext=text='%{{pts\\:hms}}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6,tile={cols}x{rows}",
        "-frames:v", "1", out])
    return out if os.path.exists(out) else None


def transcribe(path, model_name):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    m = WhisperModel(model_name, compute_type="int8")
    segs, info = m.transcribe(path, word_timestamps=True)
    words, text = [], []
    for s in segs:
        text.append(s.text.strip())
        for w in (s.words or []):
            words.append({"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2)})
    return {"lang": info.language, "text": " ".join(text), "words": words}


def download_profile(url, outdir, maxn):
    if not shutil.which("yt-dlp"):
        sys.exit("yt-dlp missing: pip install yt-dlp")
    os.makedirs(outdir, exist_ok=True)
    cmd = ["yt-dlp", "--write-info-json", "--no-overwrites", "-o", os.path.join(outdir, "%(id)s.%(ext)s"),
           "-f", "mp4/best", "--playlist-end", str(maxn), url]
    r = subprocess.run(cmd)
    if r.returncode != 0:
        print("yt-dlp reported errors (some videos may still have downloaded)", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile")
    ap.add_argument("--folder")
    ap.add_argument("--handle")
    ap.add_argument("--max", type=int, default=60)
    ap.add_argument("--whisper", default="small", help="faster-whisper model name (if installed)")
    a = ap.parse_args()
    handle = a.handle or (re.search(r"@([\w.]+)", a.profile or "") or [None, "local"])[1]
    out = os.path.join(ROOT, "out", handle)
    vids_dir = a.folder or os.path.join(out, "videos")
    if a.profile:
        download_profile(a.profile, vids_dir, a.max)
    os.makedirs(os.path.join(out, "sheets"), exist_ok=True)
    os.makedirs(os.path.join(out, "hooks"), exist_ok=True)

    rows = []
    for path in sorted(glob.glob(os.path.join(vids_dir, "*.mp4"))):
        vid = os.path.splitext(os.path.basename(path))[0]
        info_p = os.path.splitext(path)[0] + ".info.json"
        info = json.load(open(info_p)) if os.path.exists(info_p) else {}
        meta = probe(path)
        cuts = scene_cuts(path)
        d = meta["duration"] or 1
        shots = [b - a for a, b in zip([0.0] + cuts, cuts + [d])]
        row = {
            "id": vid, "url": info.get("webpage_url"), "upload_date": info.get("upload_date"),
            "title": info.get("title") or info.get("description", "")[:120],
            "views": info.get("view_count"), "likes": info.get("like_count"), "comments": info.get("comment_count"),
            "shares": info.get("repost_count"), "saves": info.get("save_count"), "music": info.get("track") or info.get("artist"),
            "duration": round(d, 2), **{k: meta[k] for k in ("w", "h", "fps", "has_audio")},
            "cuts": len(cuts), "cuts_per_10s": round(10 * len(cuts) / d, 2), "first_cut_s": cuts[0] if cuts else None,
            "avg_shot_s": round(sum(shots) / len(shots), 2) if shots else None,
            "lufs": loudness(path) if meta["has_audio"] else None,
            "hashtags": re.findall(r"#\w+", info.get("description", "") or ""),
        }
        v = row["views"] or 0
        eng = sum(x or 0 for x in (row["likes"], row["comments"], row["shares"]))
        row["engagement_rate"] = round(100 * eng / v, 2) if v else None
        row["hook_frames"] = frames(path, [0.0, 0.5, 1.0, 2.0, 3.0], os.path.join(out, "hooks", vid))
        row["sheet"] = contact_sheet(path, d, os.path.join(out, "sheets", f"{vid}.jpg"))
        tr = transcribe(path, a.whisper)
        if tr:
            row["transcript"] = tr
            first = [w for w in tr["words"] if w["s"] <= 3.0]
            row["vo_hook_3s"] = " ".join(w["w"] for w in first)
            row["wpm"] = round(60 * len(tr["words"]) / d, 1)
        rows.append(row)
        print(f"{vid}: {d:.1f}s views={row['views']} cuts/10s={row['cuts_per_10s']} first_cut={row['first_cut_s']}")

    rows.sort(key=lambda r: -(r["views"] or 0))
    json.dump(rows, open(os.path.join(out, "data.json"), "w"), indent=1, ensure_ascii=False)
    with open(os.path.join(out, "report.md"), "w") as f:
        f.write(f"# @{handle} — {len(rows)} videos\n\n")
        if rows:
            durs = [r["duration"] for r in rows]
            f.write(f"- median length {sorted(durs)[len(durs)//2]:.1f}s · share >60s: {100*sum(d>60 for d in durs)/len(durs):.0f}%\n")
            cps = [r["cuts_per_10s"] for r in rows]
            f.write(f"- median cuts per 10s {sorted(cps)[len(cps)//2]}\n\n")
        f.write("| # | views | ER% | len | cuts/10s | 1st cut | LUFS | wpm | hook (first 3s of VO) | title |\n|---|---|---|---|---|---|---|---|---|---|\n")
        for i, r in enumerate(rows, 1):
            f.write(f"| {i} | {r['views']} | {r['engagement_rate']} | {r['duration']} | {r['cuts_per_10s']} | {r['first_cut_s']} | {r['lufs']} | {r.get('wpm','')} | {r.get('vo_hook_3s','')} | {(r['title'] or '').replace('|','/')[:80]} |\n")
    print("report:", os.path.join(out, "report.md"))


if __name__ == "__main__":
    main()
