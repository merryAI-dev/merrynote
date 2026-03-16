#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Summarize Transcript
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 📋
# @raycast.argument1 { "type": "text", "placeholder": "제목", "optional": false }
# @raycast.packageName Meeting Recorder

# Documentation:
# @raycast.description 클립보드의 전문(회의/강의/인터뷰 등)을 Claude로 상세 요약하여 MD 파일로 저장합니다
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

TRANSCRIPT=$(pbpaste)
WORD_COUNT=$(echo "$TRANSCRIPT" | wc -w | tr -d ' ')

if [ "$WORD_COUNT" -lt 10 ]; then
    echo "클립보드에 충분한 텍스트가 없습니다."
    echo "전문 텍스트를 복사한 후 다시 시도해주세요."
    exit 1
fi

echo "클립보드에서 텍스트를 가져왔습니다 (${WORD_COUNT}단어)"
echo "Claude로 요약 중..."

# Find claude CLI
CLAUDE_PATH=$(which claude 2>/dev/null)
if [ -z "$CLAUDE_PATH" ]; then
    echo "Claude CLI를 찾을 수 없습니다. 원본 텍스트를 저장합니다."
    printf "# %s\n\n> 날짜: %s\n\n## 원문\n\n%s\n" "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
    echo "저장 완료: $OUTPUT_FILE"
    open "$OUTPUT_FILE"
    exit 0
fi

PROMPT_FILE=$(mktemp)
TRANSCRIPT_FILE=$(mktemp)

printf '%s' "$TRANSCRIPT" > "$TRANSCRIPT_FILE"

cat > "$PROMPT_FILE" << 'ENDPROMPT'
당신은 텍스트 요약 전문가입니다.

아래 텍스트는 회의, 강의, 인터뷰, 발표 등의 전문(transcript)입니다.
음성 인식 기반 전문일 경우 오탈자, 누락, 문맥이 끊긴 문장이 있을 수 있습니다.
문맥을 최대한 추론하여 원래 내용을 복원하고, 상세하면서도 정확하게 정리해주세요.

## 핵심 원칙

1. **맥락 중심 정리**: 단순 나열이 아니라 전체 흐름과 맥락을 파악하여 논리적으로 구조화하세요.
2. **상세하되 정확하게**: 중요한 내용은 빠짐없이 포함하되, 잡담/반복/필러는 제거하세요. 핵심이 아닌 내용을 생략할 때는 맥락이 손상되지 않는지 확인하세요.
3. **원문 충실**: 발언자의 의도와 뉘앙스를 왜곡하지 마세요. 추측이 필요한 부분은 명시하세요.
4. **용어 교정**: 음성 인식 오류로 깨진 기술 용어를 문맥에서 유추하여 교정하세요.
   - 예: "엠에스에이" → MSA, "에이피아이" → API, "씨엠에스" → CMS, "쿠버네티스" → Kubernetes
5. **구조화**: 주제별로 섹션을 나누고, 인과관계/비교/조건 등을 명확히 표현하세요.
6. **강조**: 핵심 개념, 중요 수치, 결정 사항은 **볼드**로 표시하세요.
7. **표 활용**: 비교, 분류, 조건별 처리 등은 표로 정리하세요.
8. **발언자 구분**: 누가 어떤 의견을 냈는지 구분 가능하면 표시하세요.
9. **결정 vs 미결**: 결정된 사항과 아직 논의 중인 사항을 명확히 구분하세요.

## 출력 형식

아래 구조를 기본으로 하되, 내용의 성격에 맞게 유연하게 조정하세요:

ENDPROMPT

printf '\n# %s\n\n> 날짜: %s\n\n' "$TITLE" "$TODAY" >> "$PROMPT_FILE"
cat >> "$PROMPT_FILE" << 'ENDFORMAT'
## 요약
- 전체 내용을 2~4문장으로 핵심 요약

---

## 1. [주제 섹션]
- 핵심 내용을 논리적 흐름에 따라 정리
- 중요한 배경/맥락 포함

## 2. [다음 주제 섹션]
- ...

---

## 결정 사항
- 확정된 내용 (있는 경우)

## 액션 아이템
- [ ] 담당자: 할 일 (있는 경우)

## 미결 사항 / 추가 논의 필요
- 아직 결론나지 않은 내용 (있는 경우)

---
위 형식을 따르되, 내용에 따라 섹션을 추가/제거/변경하세요.
결정 사항, 액션 아이템, 미결 사항이 없으면 해당 섹션은 생략하세요.
출력 언어는 전문의 언어와 동일하게 작성하세요.
마크다운만 출력하세요. 설명이나 부가 텍스트는 불필요합니다.
ENDFORMAT

cat "$TRANSCRIPT_FILE" >> "$PROMPT_FILE"

SUMMARY=$(cat "$PROMPT_FILE" | "$CLAUDE_PATH" -p --dangerously-skip-permissions 2>/dev/null)
rm -f "$PROMPT_FILE" "$TRANSCRIPT_FILE"

if [ -z "$SUMMARY" ]; then
    echo "Claude 요약 실패. 원본 텍스트를 저장합니다."
    printf "# %s\n\n> 날짜: %s\n\n## 원문\n\n%s\n" "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
else
    echo "$SUMMARY" > "$OUTPUT_FILE"
fi

echo "요약이 저장되었습니다: $OUTPUT_FILE"
open "$OUTPUT_FILE"
