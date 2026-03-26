#!/usr/bin/env bash
# MerryNote SwiftBar 메뉴바 플러그인
# 파일명의 "5m" = 5분마다 자동 갱신
# SwiftBar: https://github.com/swiftbar/SwiftBar
# xbar:     https://github.com/matryer/xbar

PRIMARY_PLIST="$HOME/Library/LaunchAgents/com.mysc.merrynote.plist"
LEGACY_PLIST="$HOME/Library/LaunchAgents/com.mysc.yapnotes.plist"
PLIST="$PRIMARY_PLIST"
[ -f "$PLIST" ] || [ ! -f "$LEGACY_PLIST" ] || PLIST="$LEGACY_PLIST"

PRIMARY_LOG="$HOME/.merrynote/merrynote.log"
LEGACY_LOG="$HOME/.yapnotes/yapnotes.log"
LOG_FILE="$PRIMARY_LOG"
[ -f "$LOG_FILE" ] || [ ! -f "$LEGACY_LOG" ] || LOG_FILE="$LEGACY_LOG"
NOTES_DIR=$(python3 -c "
import json, os
try:
    primary = os.path.expanduser('~/.merrynote/config.json')
    legacy = os.path.expanduser('~/.yapnotes/config.json')
    path = primary if os.path.exists(primary) else legacy
    print(json.load(open(path)).get('output_dir', os.path.expanduser('~/meeting-notes')))
except:
    print(os.path.expanduser('~/meeting-notes'))
" 2>/dev/null || echo "$HOME/meeting-notes")

# ── 데몬 상태 확인 ─────────────────────────────────────
is_running() {
    launchctl list com.mysc.merrynote 2>/dev/null | grep -q '"PID"' \
    || launchctl list com.mysc.yapnotes 2>/dev/null | grep -q '"PID"'
}

# ── 메뉴바 아이콘 ──────────────────────────────────────
if is_running; then
    echo "🎙️"
else
    echo "🎙️⚠️"
fi
echo "---"

# ── 드롭다운 메뉴 ──────────────────────────────────────
echo "MerryNote"
echo "---"

if is_running; then
    echo "✅ 감시 중"
    echo "⏹ 중지 | bash=launchctl param1=unload param2=\"$PLIST\" terminal=false refresh=true"
else
    echo "❌ 중지됨"
    echo "▶ 시작 | bash=launchctl param1=load param2=\"$PLIST\" terminal=false refresh=true"
fi

echo "---"

# 최근 회의록 5개
echo "📋 최근 회의록"
if [ -d "$NOTES_DIR" ]; then
    while IFS= read -r f; do
        NAME=$(basename "$f" .md)
        echo "   $NAME | bash=open param1=\"$f\" terminal=false"
    done < <(ls -t "$NOTES_DIR"/*.md 2>/dev/null | head -5)
else
    echo "   (없음)"
fi

echo "---"
echo "📂 meeting-notes 폴더 열기 | bash=open param1=\"$NOTES_DIR\" terminal=false"
echo "📋 로그 보기 | bash=open param1=\"-a\" param2=\"Console\" param3=\"$LOG_FILE\" terminal=false"
echo "---"
echo "🔄 새로고침 | refresh=true"
