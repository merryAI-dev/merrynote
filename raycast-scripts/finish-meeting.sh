#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Finish Record Meeting
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 📝
# @raycast.argument1 { "type": "text", "placeholder": "제목", "optional": false }
# @raycast.packageName Meeting Recorder

# Documentation:
# @raycast.description 녹음을 종료하고 전사문을 추출하여 Claude로 요약한 MD 파일을 생성합니다
# @raycast.author Joshua

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/meeting-config.json"
TITLE="$1"
TODAY=$(date +%Y-%m-%d)

if [ -f "$CONFIG_FILE" ]; then
    OUTPUT_DIR=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['output_dir'])")
else
    OUTPUT_DIR="$HOME/meeting-notes"
fi

mkdir -p "$OUTPUT_DIR"

SAFE_TITLE=$(echo "$TITLE" | tr ' ' '-')
OUTPUT_FILE="$OUTPUT_DIR/${TODAY}-${SAFE_TITLE}.md"

echo "녹음을 종료하고 전사문을 추출합니다..."
echo "전사문 생성까지 최대 120초 대기합니다."

TRANSCRIPT=$(osascript "$SCRIPT_DIR/finish-meeting-helper.applescript" "$TITLE" 2>&1)

if [[ "$TRANSCRIPT" == ERROR:* ]]; then
    echo "$TRANSCRIPT"
    exit 1
fi

WORD_COUNT=$(echo "$TRANSCRIPT" | wc -w | tr -d ' ')

if [ "$WORD_COUNT" -lt 10 ]; then
    echo "전사문 텍스트가 너무 짧습니다 (${WORD_COUNT}단어)."
    exit 1
fi

echo "전사문을 추출했습니다 (${WORD_COUNT}단어)"
echo "Claude로 요약 중..."

# Find claude CLI
CLAUDE_PATH=$(which claude 2>/dev/null)
if [ -z "$CLAUDE_PATH" ]; then
    echo "Claude CLI를 찾을 수 없습니다. 원본 전사문을 저장합니다."
    printf "# %s\n\n> 날짜: %s\n\n## 원문\n\n%s\n" "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
    echo "저장 완료: $OUTPUT_FILE"
    open "$OUTPUT_FILE"
    exit 0
fi

# 공유 프롬프트 템플릿 + MYSC vocab
MERRYNOTE_ROOT="$SCRIPT_DIR/.."
PROMPT_TEMPLATE="$MERRYNOTE_ROOT/prompts/summarize.md"

if [ -f "$PROMPT_TEMPLATE" ]; then
    PROMPT=$(cat "$PROMPT_TEMPLATE")
    PROMPT="${PROMPT//\{\{TITLE\}\}/$TITLE}"
    PROMPT="${PROMPT//\{\{DATE\}\}/$TODAY}"
    VOCAB=$(cat "$MERRYNOTE_ROOT/vocab/names.md" "$MERRYNOTE_ROOT/vocab/glossary.md" 2>/dev/null || true)
    SUMMARY=$(printf '%s\n\n## MYSC 어휘\n%s\n\n---\n\n전사문:\n%s' "$PROMPT" "$VOCAB" "$TRANSCRIPT" \
        | "$CLAUDE_PATH" -p --dangerously-skip-permissions 2>/dev/null)
else
    # fallback: 프롬프트 템플릿 없으면 직접 호출
    SUMMARY=$(printf '/meeting-notes %s\n\n%s' "$TITLE" "$TRANSCRIPT" \
        | "$CLAUDE_PATH" -p --dangerously-skip-permissions 2>/dev/null)
fi

if [ -z "$SUMMARY" ]; then
    echo "Claude 요약 실패. 원본 전사문을 저장합니다."
    printf "# %s\n\n> 날짜: %s\n\n## 원문\n\n%s\n" "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
else
    echo "$SUMMARY" > "$OUTPUT_FILE"
fi

echo "요약이 저장되었습니다: $OUTPUT_FILE"
open "$OUTPUT_FILE"
