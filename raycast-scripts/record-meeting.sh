#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Record Meeting
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🎙️
# @raycast.packageName Meeting Recorder

# Documentation:
# @raycast.description 음성 메모 앱을 열고 녹음을 시작합니다
# @raycast.author Joshua

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
osascript "$SCRIPT_DIR/record-meeting-helper.applescript"
echo "녹음을 시작했습니다"
