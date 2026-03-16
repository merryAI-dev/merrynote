#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Set Meeting Output Path
# @raycast.mode compact

# Optional parameters:
# @raycast.icon ⚙️
# @raycast.argument1 { "type": "text", "placeholder": "저장 경로 (예: ~/Desktop/meetings)" }
# @raycast.packageName Meeting Recorder

# Documentation:
# @raycast.description 회의록 MD 파일의 저장 경로를 설정합니다
# @raycast.author Joshua

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/meeting-config.json"

# Expand ~ to home directory
INPUT_PATH="$1"
EXPANDED_PATH=$(eval echo "$INPUT_PATH")

# Convert to absolute path
if [[ "$EXPANDED_PATH" != /* ]]; then
    EXPANDED_PATH="$HOME/$EXPANDED_PATH"
fi

# Create directory if it doesn't exist
mkdir -p "$EXPANDED_PATH"

if [ ! -d "$EXPANDED_PATH" ]; then
    echo "디렉토리를 생성할 수 없습니다: $EXPANDED_PATH"
    exit 1
fi

# Read existing config or create new
if [ -f "$CONFIG_FILE" ]; then
    python3 -c "
import json
config = json.load(open('$CONFIG_FILE'))
config['output_dir'] = '$EXPANDED_PATH'
json.dump(config, open('$CONFIG_FILE', 'w'), indent=2, ensure_ascii=False)
print(json.dumps(config, indent=2, ensure_ascii=False))
"
else
    cat > "$CONFIG_FILE" <<EOF
{
  "output_dir": "$EXPANDED_PATH",
  "language": "ko"
}
EOF
fi

echo "저장 경로 설정 완료: $EXPANDED_PATH"
