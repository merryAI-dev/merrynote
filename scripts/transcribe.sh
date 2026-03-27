#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# transcribe.sh — whisper-cpp 기반 전사 (TCC 권한 불필요, 빠름)
# 사용법: bash transcribe.sh <audio-file>
# 출력: 전사 텍스트 (stdout), 구조화된 에러 (stderr)
#
# 에러 코드:
#   1 = NO_FILE    파일 없음
#   2 = NO_AUDIO   오디오 스트림 없음
#   3 = FFMPEG     오디오 변환 실패
#   4 = NO_MODEL   Whisper 모델 없음
#   5 = WHISPER    전사 실패
#   6 = FINETUNE   파인튜닝 모델 실패
# ─────────────────────────────────────────────────────────────────────

set -uo pipefail

AUDIO_FILE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MERRYNOTE_ROOT="$(dirname "$SCRIPT_DIR")"
CPU_THREADS=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)

# ── config에서 모델 설정 읽기 ─────────────────────────────────────
CONFIG_FILE="$HOME/.merrynote/config.json"
[ -f "$CONFIG_FILE" ] || [ ! -f "$HOME/.yapnotes/config.json" ] || CONFIG_FILE="$HOME/.yapnotes/config.json"
TRANSCRIBE_MODEL=$(python3 -c "
import json
try: print(json.load(open('$CONFIG_FILE')).get('transcribe_model', 'whisper-cpp'))
except: print('whisper-cpp')
" 2>/dev/null || echo "whisper-cpp")

FINETUNED_MODEL_PATH=$(python3 -c "
import json
try: print(json.load(open('$CONFIG_FILE')).get('fine_tuned_model_path', ''))
except: print('')
" 2>/dev/null || echo "")

if [ ! -f "$AUDIO_FILE" ]; then
    echo "ERROR:NO_FILE: 파일 없음 — $AUDIO_FILE" >&2
    exit 1
fi

build_whisper_prompt() {
    python3 - "$MERRYNOTE_ROOT" <<'PY'
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
core = ["MYSC", "AX", "AXR", "임팩트투자", "소셜벤처", "헤이그라운드", "성수IT밸리"]
names = []
for line in (root / "vocab" / "names.md").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line.startswith("|") or "실명" in line or "---" in line:
        continue
    cols = [c.strip() for c in line.split("|") if c.strip()]
    if len(cols) >= 2:
        names.extend(cols[:2])
    if len(names) >= 40:
        break

terms = []
for line in (root / "vocab" / "glossary.md").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    match = re.match(r"- \*\*(.+?)\*\*", line)
    if match:
        terms.append(match.group(1))
    if len(terms) >= 60:
        break

prompt = " ".join(dict.fromkeys(core + names[:40] + terms[:60]))
print(prompt[:1800])
PY
}

# ── 모델 경로 ──────────────────────────────────────────────────────
MODEL_DIR="/opt/homebrew/share/whisper-cpp/models"
MODEL=""
for m in ggml-medium.bin ggml-small.bin ggml-base.bin ggml-tiny.bin; do
    if [ -f "$MODEL_DIR/$m" ]; then
        MODEL="$MODEL_DIR/$m"
        break
    fi
done

if [ -z "$MODEL" ]; then
    echo "ERROR:NO_MODEL: Whisper 모델 없음 — $MODEL_DIR" >&2
    exit 4
fi

# ── 오디오 스트림 확인 ─────────────────────────────────────────────
if ! ffprobe -i "$AUDIO_FILE" -show_streams -select_streams a -loglevel error 2>&1 | grep -q 'codec_type=audio'; then
    echo "ERROR:NO_AUDIO: 오디오 스트림 없음 — $AUDIO_FILE" >&2
    exit 2
fi

# ── 오디오 길이 확인 ──────────────────────────────────────────────
DURATION_SEC=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO_FILE" 2>/dev/null | cut -d. -f1)
DURATION_SEC=${DURATION_SEC:-0}
DURATION_MIN=$(( DURATION_SEC / 60 ))
DURATION_REM=$(( DURATION_SEC % 60 ))

if [ "$DURATION_SEC" -gt 0 ]; then
    echo "⏱️  오디오 길이: ${DURATION_MIN}분 ${DURATION_REM}초" >&2
fi

# 4시간(14400초) 초과 시 경고
if [ "$DURATION_SEC" -gt 14400 ]; then
    echo "ERROR:TOO_LONG: 오디오가 4시간 초과 (${DURATION_MIN}분) — 분할 필요" >&2
    exit 7
fi

# ── m4a → wav 변환 (whisper는 wav 필요) ───────────────────────────
TMP_BASE=$(mktemp -t merrynote-transcribe)
TMP_WAV="${TMP_BASE}.wav"
WHISPER_ERR="${TMP_BASE}.stderr"
rm -f "$TMP_BASE"
trap 'rm -f "$TMP_BASE" "$TMP_WAV" "$WHISPER_ERR"' EXIT

echo "🔄 오디오 변환 중... (${DURATION_MIN}분 분량)" >&2
if ! ffmpeg -i "$AUDIO_FILE" -ar 16000 -ac 1 -c:a pcm_s16le "$TMP_WAV" -y -loglevel error 2>&1; then
    echo "ERROR:FFMPEG: 오디오 변환 실패 — $AUDIO_FILE" >&2
    exit 3
fi

# ── 전사 (모델 라우팅) ────────────────────────────────────────────
BASENAME=$(basename "$AUDIO_FILE")

# 파인튜닝 모델 시도
if [ "$TRANSCRIBE_MODEL" = "fine-tuned" ] && [ -n "$FINETUNED_MODEL_PATH" ]; then
    FINETUNED_MODEL_PATH="${FINETUNED_MODEL_PATH/#\~/$HOME}"
    echo "🎙️  전사 중... (파일: $BASENAME, 모델: fine-tuned)" >&2
    if WHISPER_OUTPUT=$(python3 "$MERRYNOTE_ROOT/training/transcribe_finetuned.py" \
        --audio "$TMP_WAV" --model "$FINETUNED_MODEL_PATH" 2>/dev/null); then
        echo "$WHISPER_OUTPUT"
        exit 0
    else
        echo "ERROR:FINETUNE: fine-tuned 모델 실패, whisper-cpp로 폴백" >&2
        TRANSCRIBE_MODEL="whisper-cpp"
    fi
fi

# whisper-cpp (기본 또는 폴백)
if [ "$DURATION_SEC" -gt 300 ]; then
    echo "🎙️  전사 중... (파일: $BASENAME, ${DURATION_MIN}분 분량, 모델: $(basename $MODEL))" >&2
    echo "⏳ 긴 오디오 — 예상 소요: 환경에 따라 수 분~수십 분" >&2
else
    echo "🎙️  전사 중... (파일: $BASENAME, 모델: $(basename $MODEL))" >&2
fi

WHISPER_PROMPT=$(build_whisper_prompt 2>/dev/null || true)
WHISPER_ARGS=(
    --model "$MODEL"
    --language ko
    --threads "$CPU_THREADS"
    --no-timestamps
    --no-prints
    --entropy-thold 2.4
)
[ -n "$WHISPER_PROMPT" ] && WHISPER_ARGS+=(--prompt "$WHISPER_PROMPT")

WHISPER_OUTPUT=$(whisper-cli "${WHISPER_ARGS[@]}" "$TMP_WAV" 2>"$WHISPER_ERR") || {
    echo "ERROR:WHISPER: whisper 전사 실패 — $AUDIO_FILE" >&2
    [ -s "$WHISPER_ERR" ] && tail -n 20 "$WHISPER_ERR" >&2
    exit 5
}

printf '%s\n' "$WHISPER_OUTPUT" \
| sed -e 's/^[[:space:]]*//' -e '/^[[:space:]]*$/d'
