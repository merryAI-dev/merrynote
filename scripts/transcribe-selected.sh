#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# transcribe-selected.sh
# Finder Quick Action / 드래그앤드롭용
# Usage: ./transcribe-selected.sh <audio-file> [제목]
# ─────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MERRYNOTE_ROOT="$(dirname "$SCRIPT_DIR")"
NOTES_DIR="$HOME/meeting-notes"
mkdir -p "$NOTES_DIR"

AUDIO_FILE="${1:-}"
TITLE="${2:-}"

if [ -z "$AUDIO_FILE" ]; then
    osascript -e 'display alert "오디오 파일을 인자로 넘겨주세요" message "Usage: transcribe-selected.sh <file> [제목]"'
    exit 1
fi

AUDIO_FILE="${AUDIO_FILE/#\~/$HOME}"
BASENAME="$(basename "$AUDIO_FILE")"

[ -z "$TITLE" ] && TITLE="${BASENAME%.*}"

TODAY=$(date +%Y-%m-%d)
SAFE_TITLE=$(echo "$TITLE" | tr ' ' '-' | tr '/' '-')
OUTPUT_FILE="$NOTES_DIR/${TODAY}-${SAFE_TITLE}.md"

# 진행 알림
osascript -e "display notification \"$BASENAME 전사 시작...\" with title \"MerryNote 🎙️\""

# 전사
TRANSCRIPT=$(swift "$MERRYNOTE_ROOT/scripts/transcribe.swift" "$AUDIO_FILE" 2>/tmp/merrynote-sel-err.txt)

if [ -z "$TRANSCRIPT" ]; then
    ERR=$(cat /tmp/merrynote-sel-err.txt)
    osascript -e "display alert \"전사 실패\" message \"$ERR\""
    exit 1
fi

WORD_COUNT=$(echo "$TRANSCRIPT" | wc -w | tr -d ' ')

# Claude 회의록 생성
CLAUDE_PATH=$(which claude 2>/dev/null || true)

if [ -n "$CLAUDE_PATH" ]; then
    SUMMARY=$(printf '/meeting-notes %s\n\n%s' "$TITLE" "$TRANSCRIPT" \
        | "$CLAUDE_PATH" -p --dangerously-skip-permissions 2>/dev/null || true)
    [ -n "$SUMMARY" ] && echo "$SUMMARY" > "$OUTPUT_FILE" \
        || printf '# %s\n\n> 날짜: %s\n\n## 전사문\n\n%s\n' "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
else
    printf '# %s\n\n> 날짜: %s\n\n## 전사문\n\n%s\n' "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
fi

open "$OUTPUT_FILE"
osascript -e "display notification \"$BASENAME → 회의록 완성 ✅ ($WORD_COUNT 단어)\" with title \"MerryNote\""
