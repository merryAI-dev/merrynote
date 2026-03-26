#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Transcribe Audio File
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 🎙️
# @raycast.argument1 { "type": "text", "placeholder": "회의 제목 (선택)", "optional": true }
# @raycast.packageName Meeting Recorder

# Documentation:
# @raycast.description 오디오 파일을 선택해서 MYSC vocab 주입 전사 → 회의록 생성
# @raycast.author boram

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MERRYNOTE_ROOT="$(dirname "$SCRIPT_DIR")"
NOTES_DIR="$HOME/meeting-notes"
TITLE="${1:-}"

mkdir -p "$NOTES_DIR"

# ── 파일 선택 다이얼로그 ─────────────────────────────────
AUDIO_FILE=$(osascript <<'APPLESCRIPT'
set chosenFile to choose file with prompt "전사할 오디오 파일을 선택하세요:" of type {"public.audio", "com.apple.m4a-audio", "public.mp3", "public.aiff-audio", "com.microsoft.waveform-audio", "public.mpeg-4"}
return POSIX path of chosenFile
APPLESCRIPT
)

if [ -z "$AUDIO_FILE" ]; then
    echo "취소됨"
    exit 0
fi

BASENAME="$(basename "$AUDIO_FILE")"
echo "📂 선택된 파일: $BASENAME"
echo ""

# 제목 없으면 파일명에서 추출
if [ -z "$TITLE" ]; then
    TITLE="${BASENAME%.*}"
fi

# ── 전사 실행 ────────────────────────────────────────────
echo "🎙️  MYSC vocab 주입 전사 시작..."
TRANSCRIPT=$(swift "$MERRYNOTE_ROOT/scripts/transcribe.swift" "$AUDIO_FILE" 2>&1 >/tmp/merrynote-transcript.txt; cat /tmp/merrynote-transcript.txt)

if [ -z "$TRANSCRIPT" ]; then
    echo "❌ 전사 실패 또는 결과가 비어있음"
    exit 1
fi

WORD_COUNT=$(echo "$TRANSCRIPT" | wc -w | tr -d ' ')
echo "✅ 전사 완료 ($WORD_COUNT 단어)"
echo ""

# ── Claude 회의록 생성 ───────────────────────────────────
TODAY=$(date +%Y-%m-%d)
SAFE_TITLE=$(echo "$TITLE" | tr ' ' '-' | tr '/' '-')
OUTPUT_FILE="$NOTES_DIR/${TODAY}-${SAFE_TITLE}.md"

CLAUDE_PATH=$(which claude 2>/dev/null || true)

if [ -n "$CLAUDE_PATH" ]; then
    echo "📝 Claude로 회의록 생성 중..."
    SUMMARY=$(printf '/meeting-notes %s\n\n%s' "$TITLE" "$TRANSCRIPT" \
        | "$CLAUDE_PATH" -p --dangerously-skip-permissions 2>/dev/null || true)

    if [ -n "$SUMMARY" ]; then
        echo "$SUMMARY" > "$OUTPUT_FILE"
    else
        printf '# %s\n\n> 날짜: %s\n\n## 전사문\n\n%s\n' "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
        echo "⚠️  Claude 실패 — 전사문만 저장"
    fi
else
    printf '# %s\n\n> 날짜: %s\n\n## 전사문\n\n%s\n' "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
fi

echo "📄 회의록 저장: $OUTPUT_FILE"
open "$OUTPUT_FILE"

osascript -e "display notification \"$BASENAME 전사 완료 ✅\" with title \"MerryNote\" subtitle \"$OUTPUT_FILE\"" 2>/dev/null || true
