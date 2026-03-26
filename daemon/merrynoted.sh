#!/usr/bin/env bash
# MerryNote background daemon
# LaunchAgent starts this at login and restarts it on crashes.
#
# Watched folders:
#   - iCloud merrynote-inbox/ (primary)
#   - iCloud yapnotes-inbox/  (legacy compatibility)
#   - ~/Downloads/            (optional AirDrop intake)
#   - EXTRA_WATCH_DIR         (optional)

DAEMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MERRYNOTE_ROOT="$(dirname "$DAEMON_DIR")"
SCRIPTS_DIR="$MERRYNOTE_ROOT/scripts"
PROMPTS_DIR="$MERRYNOTE_ROOT/prompts"
VOCAB_DIR="$MERRYNOTE_ROOT/vocab"

PRIMARY_CONFIG_DIR="$HOME/.merrynote"
LEGACY_CONFIG_DIR="$HOME/.yapnotes"
CONFIG_FILE="$PRIMARY_CONFIG_DIR/config.json"
[ -f "$CONFIG_FILE" ] || [ ! -f "$LEGACY_CONFIG_DIR/config.json" ] || CONFIG_FILE="$LEGACY_CONFIG_DIR/config.json"

LOG_FILE="$PRIMARY_CONFIG_DIR/merrynote.log"
[ -f "$LOG_FILE" ] || [ ! -f "$LEGACY_CONFIG_DIR/yapnotes.log" ] || LOG_FILE="$LEGACY_CONFIG_DIR/yapnotes.log"
mkdir -p "$(dirname "$LOG_FILE")"

read_config() {
    local key="$1" default="$2"
    if [ -f "$CONFIG_FILE" ]; then
        python3 -c "
import json
try:
    value = json.load(open('$CONFIG_FILE')).get('$key')
    if isinstance(value, bool):
        print('true' if value else 'false')
    elif value is not None:
        print(value)
    else:
        print('$default')
except:
    print('$default')
" 2>/dev/null || echo "$default"
    else
        echo "$default"
    fi
}

OUTPUT_DIR=$(read_config "output_dir" "$HOME/meeting-notes")
WATCH_DOWNLOADS=$(read_config "watch_downloads" "true")
EXTRA_WATCH_DIR=$(read_config "extra_watch_dir" "")
COLLECT_TRAINING=$(read_config "collect_training_data" "true")

PRIMARY_ICLOUD_INBOX="$HOME/Library/Mobile Documents/com~apple~CloudDocs/merrynote-inbox"
LEGACY_ICLOUD_INBOX="$HOME/Library/Mobile Documents/com~apple~CloudDocs/yapnotes-inbox"
DOWNLOADS_DIR="$HOME/Downloads"

mkdir -p "$PRIMARY_ICLOUD_INBOX"
WATCH_DIRS=("$PRIMARY_ICLOUD_INBOX")
[ -d "$LEGACY_ICLOUD_INBOX" ] && WATCH_DIRS+=("$LEGACY_ICLOUD_INBOX")

WATCH_DOWNLOADS_CLEAN=$(echo "$WATCH_DOWNLOADS" | tr -d '[:space:]')
[ "$WATCH_DOWNLOADS_CLEAN" = "true" ] && WATCH_DIRS+=("$DOWNLOADS_DIR")

EXTRA_CLEAN=$(echo "$EXTRA_WATCH_DIR" | tr -d '[:space:]')
[ -n "$EXTRA_CLEAN" ] && [ -d "$EXTRA_CLEAN" ] && WATCH_DIRS+=("$EXTRA_CLEAN")

SUPPORTED_EXT="m4a mp3 wav aiff aac mp4 mov"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }
is_audio() {
    local ext="${1##*.}"
    echo "$SUPPORTED_EXT" | grep -qiw "$ext"
}

collect_training_data() {
    local AUDIO_FILE="$1" TRANSCRIPT="$2" SUMMARY="$3" TODAY="$4"
    local TD="$HOME/.merrynote/training-data"
    mkdir -p "$TD/audio" "$TD/transcripts" "$TD/summaries"

    local ID="${TODAY}-$(date +%H%M%S)"
    cp "$AUDIO_FILE" "$TD/audio/${ID}.${AUDIO_FILE##*.}"
    echo "$TRANSCRIPT" > "$TD/transcripts/${ID}.txt"
    echo "$SUMMARY" > "$TD/summaries/${ID}.md"

    local DUR
    DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO_FILE" 2>/dev/null | cut -d. -f1)
    printf '{"id":"%s","audio":"audio/%s.%s","transcript":"transcripts/%s.txt","summary":"summaries/%s.md","date":"%s","duration_sec":%s}\n' \
        "$ID" "$ID" "${AUDIO_FILE##*.}" "$ID" "$ID" "$TODAY" "${DUR:-0}" >> "$TD/manifest.jsonl"

    log "📦 학습 데이터 수집: $ID"
}

process_file() {
    local FILE="$1"
    local BASENAME
    BASENAME="$(basename "$FILE")"
    local TITLE="${BASENAME%.*}"
    local TODAY
    TODAY="$(date +%Y-%m-%d)"

    local PROCESSED_FILE
    PROCESSED_FILE="$(dirname "$FILE")/.processed"
    if [ -f "$PROCESSED_FILE" ] && grep -qxF "$BASENAME" "$PROCESSED_FILE" 2>/dev/null; then
        log "⏭  이미 처리됨 (.processed): $BASENAME"
        return 0
    fi

    local DURATION_SEC
    DURATION_SEC=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$FILE" 2>/dev/null | cut -d. -f1)
    DURATION_SEC=${DURATION_SEC:-0}
    local DURATION_MIN=$(( DURATION_SEC / 60 ))

    log "📥 새 파일 감지: $BASENAME (${DURATION_MIN}분)"
    if [ "$DURATION_MIN" -gt 5 ]; then
        osascript -e "display notification \"$BASENAME (${DURATION_MIN}분) 전사 시작 — 시간이 좀 걸릴 수 있어요\" with title \"MerryNote 🎙️\"" 2>/dev/null || true
    else
        osascript -e "display notification \"$BASENAME 전사 시작...\" with title \"MerryNote 🎙️\"" 2>/dev/null || true
    fi

    local wait=0
    while [ ! -s "$FILE" ] && [ "$wait" -lt 30 ]; do
        sleep 1
        wait=$((wait + 1))
    done

    local TRANSCRIPT
    local TRANSCRIBE_START TRANSCRIBE_END TRANSCRIBE_MIN
    local ERR_FILE
    ERR_FILE=$(mktemp /tmp/merrynote-err-XXXXXX)
    TRANSCRIBE_START=$(date +%s)
    if ! TRANSCRIPT=$(bash "$SCRIPTS_DIR/transcribe.sh" "$FILE" 2>"$ERR_FILE"); then
        local ERR_MSG
        ERR_MSG=$(grep '^ERROR:' "$ERR_FILE" | tail -1)
        rm -f "$ERR_FILE"
        if [ -n "$ERR_MSG" ]; then
            log "❌ 전사 실패: $BASENAME — $ERR_MSG"
        else
            log "❌ 전사 실패: $BASENAME"
        fi
        osascript -e "display notification \"$BASENAME 전사 실패 ❌\" with title \"MerryNote\"" 2>/dev/null || true
        return 1
    fi
    rm -f "$ERR_FILE"

    [ -z "$TRANSCRIPT" ] && {
        log "❌ 전사 결과 없음: $BASENAME"
        return 1
    }

    TRANSCRIBE_END=$(date +%s)
    TRANSCRIBE_MIN=$(( (TRANSCRIBE_END - TRANSCRIBE_START) / 60 ))
    local WORD_COUNT
    WORD_COUNT=$(echo "$TRANSCRIPT" | wc -w | tr -d ' ')
    log "✅ 전사 완료: $BASENAME ($WORD_COUNT 단어, ${TRANSCRIBE_MIN}분 소요)"

    mkdir -p "$OUTPUT_DIR"
    local SAFE_TITLE
    SAFE_TITLE=$(echo "$TITLE" | tr ' ' '-' | tr '/' '-')
    local OUTPUT_FILE="$OUTPUT_DIR/${TODAY}-${SAFE_TITLE}.md"

    local CLAUDE_PATH
    CLAUDE_PATH=$(which claude 2>/dev/null || true)

    if [ -n "$CLAUDE_PATH" ]; then
        if [ "$WORD_COUNT" -gt 3000 ]; then
            log "📝 Claude 회의록 생성 중: $TITLE (${WORD_COUNT}단어 — 긴 전사문)"
        else
            log "📝 Claude 회의록 생성 중: $TITLE"
        fi

        local PROMPT_TEMPLATE="$PROMPTS_DIR/summarize.md"
        local SUMMARY=""

        if [ -f "$PROMPT_TEMPLATE" ]; then
            local PROMPT
            PROMPT=$(cat "$PROMPT_TEMPLATE")
            PROMPT="${PROMPT//\{\{TITLE\}\}/$TITLE}"
            PROMPT="${PROMPT//\{\{DATE\}\}/$TODAY}"
            local VOCAB
            VOCAB=$(cat "$VOCAB_DIR/names.md" "$VOCAB_DIR/glossary.md" 2>/dev/null || true)
            SUMMARY=$(printf '%s\n\n## MYSC 어휘\n%s\n\n---\n\n> 소요 시간: %s분 (전사 기준)\n\n전사문:\n%s' \
                "$PROMPT" "$VOCAB" "$TRANSCRIBE_MIN" "$TRANSCRIPT" \
                | "$CLAUDE_PATH" -p --dangerously-skip-permissions 2>>"$LOG_FILE" || true)
        else
            SUMMARY=$(printf '/meeting-notes %s\n\n> 소요 시간: %s분 (전사 기준)\n\n%s' "$TITLE" "$TRANSCRIBE_MIN" "$TRANSCRIPT" \
                | "$CLAUDE_PATH" -p --dangerously-skip-permissions 2>>"$LOG_FILE" || true)
        fi

        local SUMMARY_VALID=true

        if echo "$SUMMARY" | grep -qiE '(Not logged in|Please run /login|ECONNREFUSED|rate limit)'; then
            log "⚠️  Claude 응답에 에러 감지: $(echo "$SUMMARY" | head -1)"
            SUMMARY_VALID=false
        fi

        if [ ${#SUMMARY} -lt 200 ]; then
            log "⚠️  Claude 응답이 너무 짧음 (${#SUMMARY}자)"
            SUMMARY_VALID=false
        fi

        if ! echo "$SUMMARY" | head -5 | grep -qE '^# '; then
            log "⚠️  Claude 응답이 마크다운 형식이 아님"
            SUMMARY_VALID=false
        fi

        if [ "$SUMMARY_VALID" = true ]; then
            echo "$SUMMARY" > "$OUTPUT_FILE"
            log "📄 회의록 저장: $OUTPUT_FILE"
            [ "$COLLECT_TRAINING" = "true" ] && \
                collect_training_data "$FILE" "$TRANSCRIPT" "$SUMMARY" "$TODAY" 2>/dev/null || true
        else
            printf '# %s\n\n> 날짜: %s\n\n## 전사문\n\n%s\n' "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
            log "⚠️  Claude 응답 검증 실패 — 전사문만 저장: $OUTPUT_FILE"
        fi
    else
        printf '# %s\n\n> 날짜: %s\n\n## 전사문\n\n%s\n' "$TITLE" "$TODAY" "$TRANSCRIPT" > "$OUTPUT_FILE"
        log "📄 전사문 저장 (Claude 없음): $OUTPUT_FILE"
    fi

    if echo "$TITLE" | grep -qE '^(새로운[-_ ]?녹음|New[-_ ]?Recording|녹음)[-_ ]?[0-9]*$'; then
        local BETTER_TITLE
        BETTER_TITLE=$(head -1 "$OUTPUT_FILE" | sed -n 's/^# \+//p' | tr -d '\r')
        if [ -n "$BETTER_TITLE" ]; then
            local NEW_SAFE_TITLE
            NEW_SAFE_TITLE=$(echo "$BETTER_TITLE" | tr ' /' '--' | tr -dc '[:alnum:]가-힣_-' | cut -c1-60)
            local NEW_OUTPUT_FILE="$OUTPUT_DIR/${TODAY}-${NEW_SAFE_TITLE}.md"
            if [ ! -f "$NEW_OUTPUT_FILE" ] && [ "$NEW_OUTPUT_FILE" != "$OUTPUT_FILE" ]; then
                mv "$OUTPUT_FILE" "$NEW_OUTPUT_FILE" 2>/dev/null && {
                    OUTPUT_FILE="$NEW_OUTPUT_FILE"
                    log "📛 파일명 개선: $(basename "$NEW_OUTPUT_FILE")"
                }
            fi
        fi
    fi

    local FILE_DIR
    FILE_DIR="$(dirname "$FILE")"
    if [[ "$FILE_DIR" == *"merrynote-inbox"* || "$FILE_DIR" == *"yapnotes-inbox"* ]]; then
        local DONE_DIR="$FILE_DIR/.done"
        mkdir -p "$DONE_DIR"
        if mv "$FILE" "$DONE_DIR/$BASENAME" 2>>"$LOG_FILE"; then
            log "✔  $BASENAME → .done 이동"
        else
            log "⚠️  mv 실패, cp+rm 시도: $BASENAME"
            if cp "$FILE" "$DONE_DIR/$BASENAME" 2>>"$LOG_FILE" && rm "$FILE" 2>>"$LOG_FILE"; then
                log "✔  $BASENAME → .done 이동 (cp+rm)"
            else
                echo "$BASENAME" >> "$PROCESSED_FILE"
                log "❌ 파일 이동 실패: $BASENAME — .processed에 기록"
            fi
        fi
    fi

    osascript -e "display notification \"$BASENAME → 회의록 완성 ✅\" with title \"MerryNote\" subtitle \"$(basename "$OUTPUT_FILE")\"" 2>/dev/null || true
}

log "🚀 MerryNote daemon 시작"
log "   감시 폴더: ${WATCH_DIRS[*]}"
log "   출력 경로: $OUTPUT_DIR"

for DIR in "${WATCH_DIRS[@]}"; do
    [ -d "$DIR" ] || continue
    for EXT in $SUPPORTED_EXT; do
        while IFS= read -r -d '' FILE; do
            process_file "$FILE" || true
        done < <(find "$DIR" -maxdepth 1 -iname "*.$EXT" -print0 2>/dev/null)
    done
done

if ! command -v fswatch &>/dev/null; then
    log "❌ fswatch 없음 — brew install fswatch 필요"
    exit 1
fi

log "👀 fswatch 감시 시작: ${WATCH_DIRS[*]}"

fswatch -0 --event Created --event Renamed --event MovedTo "${WATCH_DIRS[@]}" \
| while IFS= read -r -d '' CHANGED_FILE; do
    [[ "$CHANGED_FILE" == */\.* ]] && continue
    [[ "$CHANGED_FILE" == */.done/* ]] && continue

    is_audio "$CHANGED_FILE" || continue
    [ -f "$CHANGED_FILE" ] || continue

    if [[ "$CHANGED_FILE" == "$DOWNLOADS_DIR"/* ]]; then
        FILE_MTIME=$(stat -f "%m" "$CHANGED_FILE" 2>/dev/null || echo 0)
        FILE_NOW=$(date +%s)
        [ $((FILE_NOW - FILE_MTIME)) -gt 600 ] && continue
    fi

    sleep 1
    process_file "$CHANGED_FILE" || true
done
