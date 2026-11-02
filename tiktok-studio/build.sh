#!/usr/bin/env bash
# One command per video: voice-over -> audio mix -> frame render -> mux.
#   ./build.sh videos/us01_spotlight                 # provider from script.json (elevenlabs -> falls back to kokoro)
#   TTS_PROVIDER=kokoro ./build.sh videos/us02_manipulation
#   WORKERS=3 CRF=17 ./build.sh videos/fr01_effet_projecteur
set -euo pipefail
cd "$(dirname "$0")"
V="${1:?usage: ./build.sh videos/<id>}"; V="${V%/}"
ID="$(basename "$V")"
export KOKORO_DIR="${KOKORO_DIR:-$PWD/.models}"
VOICE_TAG="${TTS_PROVIDER:-auto}"
python3 audio/tts.py "$V" ${TTS_PROVIDER:+--provider "$TTS_PROVIDER"}
python3 audio/mix.py "$V"
LABEL="$(python3 -c "import json;print(json.load(open('$V/build/timeline.json'))['voice'].split(':')[0])")"
mkdir -p renders
node engine/render.mjs --comp "$V" --audio "$V/build/mix.wav" --out "renders/${ID}__${LABEL}.mp4" --workers "${WORKERS:-3}" --crf "${CRF:-17}"
# a no-music version so a trending TikTok sound can be added in-app
ffmpeg -y -loglevel error -i "renders/${ID}__${LABEL}.mp4" -i "$V/build/mix_nomusic.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart "renders/${ID}__${LABEL}__nomusic.mp4"
echo "done: renders/${ID}__${LABEL}.mp4"
