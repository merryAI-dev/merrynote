#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# watch-inbox.sh
# iCloud merrynote-inbox 폴더를 감시하다가 새 오디오 파일이
# 들어오면 자동으로 MYSC vocab 주입 전사 → 회의록 생성
#
# Usage:
#   ./watch-inbox.sh            # 무한 감시 시작
#   ./watch-inbox.sh --once     # inbox 안 파일 한 번만 처리
# ─────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MERRYNOTE_ROOT="$(dirname "$SCRIPT_DIR")"

# ── iCloud inbox 경로 ─────────────────────────────────────
ICLOUD_BASE="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
PRIMARY_INBOX_DIR="$ICLOUD_BASE/merrynote-inbox"
LEGACY_INBOX_DIR="$ICLOUD_BASE/yapnotes-inbox"
NOTES_DIR="$HOME/meeting-notes"

mkdir -p "$PRIMARY_INBOX_DIR" "$LEGACY_INBOX_DIR" "$NOTES_DIR"
WATCH_DIRS=("$PRIMARY_INBOX_DIR" "$LEGACY_INBOX_DIR")

SUPPORTED_EXT="m4a mp3 wav aiff aac mp4 mov"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

process_file() {
    local FILE="$1"
    local BASENAME
    BASENAME="$(basename "$FILE")"
    local TITLE="${BASENAME%.*}"   # 파일명을 기본 제목으로 사용
    local TODAY
    TODAY="$(date +%Y-%m-%d)"

    log "🎙️  새 파일 감지: $BASENAME"

    # 전사 실행
    local TRANSCRIPT
    if ! TRANSCRIPT=$(swift "$SCRIPT_DIR/transcribe.swift" "$FILE" 2>/tmp/merrynote-watch-err.txt); then
        log "❌ 전사 실패:"
        cat /tmp/merrynote-watch-err.txt
        return 1
    fi

    local WORD_COUNT
    WORD_COUNT=$(echo "$TRANSCRIPT" | wc -w | tr -d ' ')
    log "✅ 전사 완료 ($WORD_COUNT 단어)"

    # Claude로 회의록 생성 (Claude CLI 있을 때만)
    local CLAUDE_PATH
    CLAUDE_PATH=$(which claude 2>/dev/null || true)

    local SAFE_TITLE
    SAFE_TITLE=$(echo "$TITLE" | tr ' ' '-' | tr '/' '-')
    local OUTPUT_FILE="$NOTES_DIR/${TODAY}-${SAFE_TITLE}.md"

    if [ -n "$CLAUDE_PATH" ]; then
        log "📝 Claude로 회의록 생성 중..."
        local PROMPT_TEMPLATE="$MERRYNOTE_ROOT/prompts/summarize.md"
        local SUMMARY=""

        if [ -f "$PROMPT_TEMPLATE" ]; then
            local PROMPT
            PROMPT=$(cat "$PROMPT_TEMPLATE")
            PROMPT="${PROMPT//\{\{TITLE\}\}/$TITLE}"
            PROMPT="${PROMPT//\{\{DATE\}\}/$TODAY}"
            local VOCAB
            VOCAB=$(cat "$MERRYNOTE_ROOT/vocab/names.md" "$MERRYNOTE_ROOT/vocab/glossary.md" 2>/dev/null || true)
            SUMMARY=$(printf '%s\n\n## MYSC 어휘\n%s\n\n---\n\n전사문:\n%s' "$PROMPT" "$VOCAB" "$TRANSCRIPT" \
                | "$CLAUDE_PATH" -p --dangerously-skip-permissions 2>/dev/null || true)
        else
            SUMMARY=$(printf '/meeting-notes %s\n\n%s' "$TITLE" "$TRANSCRIPT" \
                | "$CLAUDE_PATH" -p --dangerously-skip-permissions 2>/dev/null || true)
        fi

        if [ -n "$SUMMARY" ]; then
            echo "$SUMMARY" > "$OUTPUT_FILE"
            log "📄 회의록 저장: $OUTPUT_FILE"
        else
            printf '# %s\n\n> 날짜: %s\n\n## 전사문\n\n%s\n' "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
            log "⚠️  Claude 실패 — 전사문만 저장: $OUTPUT_FILE"
        fi
    else
        printf '# %s\n\n> 날짜: %s\n\n## 전사문\n\n%s\n' "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
        log "📄 전사문 저장 (Claude 없음): $OUTPUT_FILE"
    fi

    # 처리 완료 파일 → .done 이동
    local FILE_DIR
    FILE_DIR="$(dirname "$FILE")"
    local DONE_DIR="$FILE_DIR/.done"
    mkdir -p "$DONE_DIR"
    mv "$FILE" "$DONE_DIR/$BASENAME"
    log "✔  $BASENAME → .done 이동"

    # macOS 알림
    osascript -e "display notification \"$BASENAME 전사 완료 ✅\" with title \"MerryNote\" subtitle \"$OUTPUT_FILE\"" 2>/dev/null || true
}

process_all_pending() {
    local FOUND=0
    for EXT in $SUPPORTED_EXT; do
        while IFS= read -r -d '' FILE; do
            FOUND=1
            process_file "$FILE" || log "⚠️  처리 실패: $FILE"
        done < <(find "${WATCH_DIRS[@]}" -maxdepth 1 -iname "*.$EXT" -print0 2>/dev/null)
    done
    [ "$FOUND" -eq 0 ] && log "📭 처리할 파일 없음"
}

# ── --once 모드 ───────────────────────────────────────────
if [[ "${1:-}" == "--once" ]]; then
    log "🔍 inbox 스캔 (one-shot): ${WATCH_DIRS[*]}"
    process_all_pending
    exit 0
fi

# ── 상시 감시 모드 ────────────────────────────────────────
log "👀 inbox 감시 시작: ${WATCH_DIRS[*]}"
log "   중지하려면 Ctrl+C"
echo ""

# 시작 시 기존 파일 처리
process_all_pending

# fswatch로 실시간 감시 (없으면 폴링 fallback)
if command -v fswatch &>/dev/null; then
    fswatch -0 --event Created --event Renamed "${WATCH_DIRS[@]}" \
    | while IFS= read -r -d '' CHANGED_FILE; do
        EXT="${CHANGED_FILE##*.}"
        EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')
        if echo "$SUPPORTED_EXT" | grep -qw "$EXT_LOWER"; then
            sleep 1  # iCloud 다운로드 완료 대기
            [ -f "$CHANGED_FILE" ] && process_file "$CHANGED_FILE" || true
        fi
    done
else
    # fswatch 없을 때 5초 폴링
    log "⚠️  fswatch 없음 — 5초 폴링 모드 (brew install fswatch 권장)"
    while true; do
        process_all_pending
        sleep 5
    done
fi
