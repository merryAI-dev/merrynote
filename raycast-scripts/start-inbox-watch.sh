#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Start MerryNote Inbox Watch
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 📡
# @raycast.packageName Meeting Recorder

# Documentation:
# @raycast.description iCloud merrynote-inbox 폴더 감시 시작 (아이폰 녹음 자동 전사)
# @raycast.author boram

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="/tmp/merrynote-watch.pid"
LEGACY_PID_FILE="/tmp/yapnotes-watch.pid"
LOG_FILE="/tmp/merrynote-watch.log"
LEGACY_LOG_FILE="/tmp/yapnotes-watch.log"
SCRIPT="$ROOT_DIR/scripts/watch-inbox.sh"

ACTIVE_PID_FILE="$PID_FILE"
[ -f "$ACTIVE_PID_FILE" ] || ACTIVE_PID_FILE="$LEGACY_PID_FILE"

if [ -f "$ACTIVE_PID_FILE" ] && kill -0 "$(cat "$ACTIVE_PID_FILE")" 2>/dev/null; then
    echo "✅ 이미 감시 중 (PID: $(cat "$ACTIVE_PID_FILE"))"
    echo ""
    echo "── 최근 로그 ──"
    tail -20 "$LOG_FILE"
    exit 0
fi

nohup "$SCRIPT" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo $! > "$LEGACY_PID_FILE"
ln -sf "$LOG_FILE" "$LEGACY_LOG_FILE" 2>/dev/null || cp "$LOG_FILE" "$LEGACY_LOG_FILE" 2>/dev/null || true

sleep 1
echo "📡 inbox 감시 시작됨 (PID: $(cat "$PID_FILE"))"
echo "📂 감시 폴더: ~/Library/Mobile Documents/com~apple~CloudDocs/merrynote-inbox/ (+ legacy yapnotes-inbox/)"
echo ""
echo "── 로그 ──"
tail -10 "$LOG_FILE"
