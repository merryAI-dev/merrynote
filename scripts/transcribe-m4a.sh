#!/usr/bin/env bash

# transcribe-m4a.sh
# M4A 파일을 전사(텍스트 변환)하고 meeting-notes 스킬로 넘깁니다.
#
# Usage:
#   ./transcribe-m4a.sh <audio-file> [회의 제목]
#
# Example:
#   ./transcribe-m4a.sh ~/Downloads/회의녹음.m4a "3월 AX 챔피언 미팅"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWIFT_SCRIPT="$SCRIPT_DIR/transcribe.swift"
CACHE_DIR="$HOME/.yapnotes-cache"
mkdir -p "$CACHE_DIR"

# ── 인자 파싱 ──────────────────────────────────────────
AUDIO_FILE="${1:-}"
TITLE="${2:-}"

if [[ -z "$AUDIO_FILE" ]]; then
    echo "Usage: $0 <audio-file.m4a> [회의 제목]"
    echo ""
    echo "Example:"
    echo "  $0 ~/Downloads/recording.m4a \"3월 AX 챔피언 미팅\""
    exit 1
fi

AUDIO_FILE="${AUDIO_FILE/#\~/$HOME}"  # tilde 확장

if [[ ! -f "$AUDIO_FILE" ]]; then
    echo "❌ 파일을 찾을 수 없어요: $AUDIO_FILE"
    exit 1
fi

EXT="${AUDIO_FILE##*.}"
EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')

# ── 지원 포맷 확인 ──────────────────────────────────────
SUPPORTED="m4a mp3 wav aiff aac mp4 mov"
if ! echo "$SUPPORTED" | grep -qw "$EXT_LOWER"; then
    echo "❌ 지원하지 않는 포맷: .$EXT"
    echo "   지원 포맷: $SUPPORTED"
    exit 1
fi

echo ""
echo "🎙️  MYSC yapnotes — M4A 전사 시작"
echo "=================================="
echo "파일: $(basename "$AUDIO_FILE")"
echo ""

# ── 전사 실행 ──────────────────────────────────────────
TRANSCRIPT_FILE="$CACHE_DIR/transcript-$(date +%s).txt"

if swift "$SWIFT_SCRIPT" "$AUDIO_FILE" > "$TRANSCRIPT_FILE" 2>/tmp/transcribe-err.txt; then
    TRANSCRIPT=$(cat "$TRANSCRIPT_FILE")
else
    ERR=$(cat /tmp/transcribe-err.txt)
    echo "❌ 전사 실패:"
    echo "$ERR"
    exit 1
fi

if [[ -z "$TRANSCRIPT" ]]; then
    echo "❌ 전사 결과가 비어있어요. 오디오 파일을 확인해주세요."
    exit 1
fi

WORD_COUNT=$(echo "$TRANSCRIPT" | wc -w | tr -d ' ')
echo "✅ 전사 완료! ($WORD_COUNT 단어)"
echo ""
echo "── 전사문 미리보기 ──────────────────────────────"
echo "$TRANSCRIPT" | head -c 500
echo ""
echo "─────────────────────────────────────────────────"
echo ""

# ── 결과 저장 ──────────────────────────────────────────
TRANSCRIPT_OUT="${AUDIO_FILE%.*}-transcript.txt"
echo "$TRANSCRIPT" > "$TRANSCRIPT_OUT"
echo "📄 전사문 저장됨: $TRANSCRIPT_OUT"
echo ""
echo "💡 Claude Code에서 회의록 만들기:"
if [[ -n "$TITLE" ]]; then
    echo "   /meeting-notes $TITLE"
else
    echo "   /meeting-notes [제목]"
fi
echo "   (아래 전사문을 함께 붙여넣으세요)"
echo ""
echo "═══════════════════════════════════════"
cat "$TRANSCRIPT_OUT"
echo "═══════════════════════════════════════"
