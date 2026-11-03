# Clyvant TikTok Studio

Faceless TikTok videos rendered entirely from code: 3D scenes (Three.js), motion graphics and
kinetic typography (Poppins), word-synced captions, a voice-over (ElevenLabs or local Kokoro),
procedural sound design and a music bed. One command per video produces a 1080×1920, 30 fps MP4,
loudness-normalised to −14 LUFS.

| Video | Language | Length | Topic |
|---|---|---|---|
| `videos/us01_spotlight` | EN-US | 1:23 | The spotlight effect — "nobody is watching you as closely as you think" |
| `videos/us02_manipulation` | EN-US | 1:56 | 5 manipulation tactics (dark psychology, framed as defence) |
| `videos/fr01_effet_projecteur` | FR | 1:34 | L'effet projecteur (French script, same direction as US-01) |

The strategy behind them is in [`PLAYBOOK.md`](PLAYBOOK.md).

## Setup (once per machine/session)

```bash
cd tiktok-studio
npm install                                   # three.js + Poppins
pip install kokoro-onnx soundfile pyloudnorm scipy requests yt-dlp
```

Playwright + Chromium and ffmpeg must be available (they are pre-installed in Claude cloud sessions).

**Voice-over providers**

- **ElevenLabs (preferred).** Set `ELEVENLABS_API_KEY` in the environment (Claude cloud: environment settings →
  Network secrets) and allow `api.elevenlabs.io` in the environment's network access. Each script names its
  voice in `voice.el_voice_name` (default `Brian` for US) or `voice.el_voice_id`. The French script has a
  placeholder `REPLACE_WITH_NATIVE_FRENCH_VOICE` — pick a native French voice in the ElevenLabs Voice Library
  and paste its name or ID. ElevenLabs returns character timings, so captions stay word-accurate.
- **Kokoro (local fallback, Apache-2.0).** Used automatically when no ElevenLabs key is set. Download the
  timing-enabled model files into `.models/`:

  ```bash
  mkdir -p .models && cd .models
  curl -L -o kokoro-timed.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx
  curl -L -o voices.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin
  ```

## Build a video

```bash
./build.sh videos/us01_spotlight                   # ElevenLabs if a key is set, else Kokoro
TTS_PROVIDER=kokoro ./build.sh videos/us02_manipulation
```

Outputs `renders/<id>__<provider>.mp4` and a `__nomusic.mp4` twin (voice + SFX only) for adding a
trending TikTok sound in-app. Rendering runs ~2 frames/s on 4 CPUs (≈20–30 min per video).

Quick QA without a full render — stills at given times:

```bash
node engine/render.mjs --comp videos/us01_spotlight --stills 0s,3.5s,19.6s,58s
```

## How it works

```
script.json ──► audio/tts.py ──► build/vo.wav + build/timeline.json (beats, word timings, SFX cues)
                                   │
                 audio/mix.py ◄────┤  voice chain + procedural SFX (audio/sfx.py) + ducked music (audio/music.py)
                                   │
   comp.js + engine/*.js ──► engine/render.mjs (Playwright, frame-stepped) ──► ffmpeg ──► MP4
```

- `script.json` — the source of truth: VO lines per beat, emphasis words, caption replacements
  (`"twenty-three": "23%"`), SFX cues pinned to words (`"at": "word:twenty"`), music moods pinned to beats,
  and all on-screen text (`ui`). A comp can be reused for another language through `anchors`
  (maps the English sync words to the translated ones — see `fr01_effet_projecteur`).
- `comp.js` — the direction: 3D sets, camera paths and 2D motion graphics, all as pure functions of time
  synced to word timings (`S.w('actual', 'twenty')`), so frames render in parallel and deterministically.
- `engine/kit3d.js` — mannequin (articulated, walk cycle), volumetric spotlight cones, light pools, dust,
  theatre + instanced audience (people can be lit to visualise percentages), particle brain, door,
  slot machine, can, marionette strings, label sprites, camera paths.
- `engine/ui.js` — study citation cards, animated stat bars, title slams, chapter cards, stamps,
  waveform, icon tiles, end card. `engine/runtime.js` — easing, captions, grain, flashes, shakes, punch-ins.
- `audio/sfx.py` — 28 synthesised sounds (whooshes, impacts, risers, sub drops, pops, ticks, dings,
  glitches, heartbeat, shimmer, stamp…). No samples, no licensing issues.

## Competitor analysis

```bash
python3 analysis/analyze.py --profile https://www.tiktok.com/@orythum --max 60
python3 analysis/analyze.py --profile https://www.tiktok.com/@cryothum --max 60
```

Needs network access to `www.tiktok.com` and TikTok's CDNs. Produces `analysis/out/<handle>/report.md`
(views, engagement rate, length, cuts per 10 s, time to first cut, loudness, words per minute, the first
3 s of voice-over), a contact sheet per video and the hook frames at 0/0.5/1/2/3 s. Transcripts are added
when `faster-whisper` is installed. You can also download videos yourself and run `--folder`.

## Fonts & licences

Poppins (SIL Open Font License, `assets/fonts/OFL-Poppins.txt`). Three.js (MIT). Kokoro-82M (Apache-2.0).
All SFX and music are generated by code in this repo.
