#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Stop MerryNote Inbox Watch
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 🔴
# @raycast.packageName Meeting Recorder

# Documentation:
# @raycast.description iCloud inbox 감시 중지
# @raycast.author boram

PID_FILE="/tmp/merrynote-watch.pid"
LEGACY_PID_FILE="/tmp/yapnotes-watch.pid"

ACTIVE_PID_FILE="$PID_FILE"
[ -f "$ACTIVE_PID_FILE" ] || ACTIVE_PID_FILE="$LEGACY_PID_FILE"

if [ ! -f "$ACTIVE_PID_FILE" ]; then
    echo "⚪ 감시 중인 프로세스 없음"
    exit 0
fi

PID=$(cat "$ACTIVE_PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    rm -f "$PID_FILE" "$LEGACY_PID_FILE"
    echo "🔴 inbox 감시 종료 (PID: $PID)"
else
    rm -f "$PID_FILE" "$LEGACY_PID_FILE"
    echo "⚪ 이미 종료된 프로세스 (PID: $PID)"
fi
