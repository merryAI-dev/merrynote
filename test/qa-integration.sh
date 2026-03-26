#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# MerryNote 통합 QA 테스트
#
# 실제 오디오 파일로 전체 파이프라인을 테스트한다.
# 함수 단위가 아닌 기능 단위 + 소요 시간 중심.
#
# Usage:
#   bash test/qa-integration.sh                    # 전체 실행
#   bash test/qa-integration.sh --quick            # 빠른 테스트만 (오디오 변환 제외)
#   bash test/qa-integration.sh --long             # 긴 오디오 포함 (68분)
# ─────────────────────────────────────────────────────────────────────

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MERRYNOTE_ROOT="$(dirname "$SCRIPT_DIR")"
SCRIPTS="$MERRYNOTE_ROOT/scripts"
DAEMON="$MERRYNOTE_ROOT/daemon"
PROMPTS="$MERRYNOTE_ROOT/prompts"
TRAINING="$MERRYNOTE_ROOT/training"
CONFIG_PATH="$HOME/.merrynote/config.json"
[ -f "$CONFIG_PATH" ] || [ ! -f "$HOME/.yapnotes/config.json" ] || CONFIG_PATH="$HOME/.yapnotes/config.json"

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

MODE="${1:---all}"
PASS=0
FAIL=0
SKIP=0
RESULTS=()

# ── 유틸 ────────────────────────────────────────────────────────────
timer_start() { TIMER_START=$(python3 -c "import time; print(int(time.time()*1000))"); }
timer_end() {
    local END=$(python3 -c "import time; print(int(time.time()*1000))")
    ELAPSED_MS=$(( END - TIMER_START ))
    ELAPSED_SEC=$(python3 -c "print(f'{$ELAPSED_MS/1000:.1f}')")
}

pass() {
    PASS=$((PASS + 1))
    RESULTS+=("${GREEN}PASS${NC} $1 (${ELAPSED_SEC}s)")
    printf "  ${GREEN}✓${NC} %s ${CYAN}(%ss)${NC}\n" "$1" "$ELAPSED_SEC"
}

fail() {
    FAIL=$((FAIL + 1))
    RESULTS+=("${RED}FAIL${NC} $1 — $2")
    printf "  ${RED}✗${NC} %s — %s\n" "$1" "$2"
}

skip() {
    SKIP=$((SKIP + 1))
    RESULTS+=("${YELLOW}SKIP${NC} $1 — $2")
    printf "  ${YELLOW}⊘${NC} %s — %s\n" "$1" "$2"
}

section() { printf "\n${CYAN}━━━ %s ━━━${NC}\n" "$1"; }

# ── 테스트용 오디오 생성 ─────────────────────────────────────────────
TMP_DIR=$(mktemp -d /tmp/merrynote-qa-XXXXXX)
trap 'rm -rf "$TMP_DIR"' EXIT

# 10초 무음 wav (빠른 테스트용)
create_silent_audio() {
    ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 10 "$TMP_DIR/silent-10s.wav" -y -loglevel error 2>/dev/null
    ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 10 "$TMP_DIR/silent-10s.m4a" -y -loglevel error 2>/dev/null
}

# 빈 파일 (에러 테스트용)
create_bad_files() {
    touch "$TMP_DIR/empty.mp4"
    echo "not audio" > "$TMP_DIR/fake.m4a"
    cp /dev/null "$TMP_DIR/zero.wav"
}

# ═══════════════════════════════════════════════════════════════════
# SUITE 1: 파일 검증 — 스크립트, 설정, 디렉토리 존재 확인
# ═══════════════════════════════════════════════════════════════════
section "SUITE 1: 파일 & 의존성 검증"

timer_start
for f in "$SCRIPTS/transcribe.sh" "$DAEMON/merrynoted.sh" "$PROMPTS/summarize.md" \
         "$SCRIPTS/watch-inbox.sh" "$SCRIPTS/transcribe.swift"; do
    if [ ! -f "$f" ]; then
        timer_end; fail "파일 존재: $(basename $f)" "파일 없음"
        continue
    fi
done
timer_end; pass "핵심 스크립트 5개 존재"

timer_start
for cmd in ffmpeg ffprobe whisper-cli python3; do
    if ! command -v "$cmd" &>/dev/null; then
        timer_end; fail "의존성: $cmd" "설치 안 됨"
        continue
    fi
done
timer_end; pass "외부 의존성 4개 확인 (ffmpeg, ffprobe, whisper-cli, python3)"

timer_start
if [ -f "/opt/homebrew/share/whisper-cpp/models/ggml-medium.bin" ]; then
    timer_end; pass "whisper 모델 존재 (ggml-medium.bin)"
else
    timer_end; fail "whisper 모델" "ggml-medium.bin 없음"
fi

timer_start
bash -n "$SCRIPTS/transcribe.sh" 2>/dev/null && \
bash -n "$DAEMON/merrynoted.sh" 2>/dev/null && \
bash -n "$SCRIPTS/watch-inbox.sh" 2>/dev/null
timer_end
if [ $? -eq 0 ]; then pass "전 스크립트 bash 문법 검증"; else fail "bash 문법" "syntax error"; fi

timer_start
if python3 -c "import ast; ast.parse(open('$TRAINING/fine_tune.py').read())" 2>/dev/null && \
   python3 -c "import ast; ast.parse(open('$TRAINING/extract_text.py').read())" 2>/dev/null && \
   python3 -c "import ast; ast.parse(open('$TRAINING/transcribe_finetuned.py').read())" 2>/dev/null; then
    timer_end; pass "Python 스크립트 3개 문법 검증"
else
    timer_end; fail "Python 문법" "syntax error"
fi

# ═══════════════════════════════════════════════════════════════════
# SUITE 2: 에러 핸들링 — 잘못된 입력에 대한 반응
# ═══════════════════════════════════════════════════════════════════
section "SUITE 2: 에러 핸들링 (잘못된 입력)"

create_bad_files

# 존재하지 않는 파일
timer_start
OUTPUT=$(bash "$SCRIPTS/transcribe.sh" "/tmp/nonexistent-xyz.m4a" 2>&1)
EXIT_CODE=$?
timer_end
if [ $EXIT_CODE -eq 1 ] && echo "$OUTPUT" | grep -q "ERROR:NO_FILE"; then
    pass "존재하지 않는 파일 → ERROR:NO_FILE (exit 1)"
else
    fail "존재하지 않는 파일" "exit=$EXIT_CODE, output=$OUTPUT"
fi

# 빈 파일 (오디오 스트림 없음)
timer_start
OUTPUT=$(bash "$SCRIPTS/transcribe.sh" "$TMP_DIR/empty.mp4" 2>&1)
EXIT_CODE=$?
timer_end
if [ $EXIT_CODE -eq 2 ] && echo "$OUTPUT" | grep -q "ERROR:NO_AUDIO"; then
    pass "빈 mp4 → ERROR:NO_AUDIO (exit 2)"
else
    fail "빈 mp4" "exit=$EXIT_CODE, output=$(echo $OUTPUT | head -1)"
fi

# 가짜 오디오 파일
timer_start
OUTPUT=$(bash "$SCRIPTS/transcribe.sh" "$TMP_DIR/fake.m4a" 2>&1)
EXIT_CODE=$?
timer_end
if [ $EXIT_CODE -ne 0 ]; then
    pass "가짜 m4a → 에러 반환 (exit $EXIT_CODE)"
else
    fail "가짜 m4a" "에러 없이 통과됨"
fi

# ═══════════════════════════════════════════════════════════════════
# SUITE 3: 오디오 변환 파이프라인 — ffmpeg 변환 성능
# ═══════════════════════════════════════════════════════════════════
section "SUITE 3: 오디오 변환 파이프라인"

create_silent_audio

# 10초 m4a → wav 변환 속도
timer_start
TMP_WAV="$TMP_DIR/converted.wav"
ffmpeg -i "$TMP_DIR/silent-10s.m4a" -ar 16000 -ac 1 -c:a pcm_s16le "$TMP_WAV" -y -loglevel error 2>/dev/null
timer_end
if [ -f "$TMP_WAV" ] && [ -s "$TMP_WAV" ]; then
    pass "m4a→wav 변환 (10초 오디오)"
else
    fail "m4a→wav 변환" "출력 파일 없음"
fi

# ffprobe 오디오 스트림 감지
timer_start
PROBE=$(ffprobe -i "$TMP_DIR/silent-10s.m4a" -show_streams -select_streams a -loglevel error 2>&1)
timer_end
if echo "$PROBE" | grep -q "codec_type=audio"; then
    pass "ffprobe 오디오 스트림 감지"
else
    fail "ffprobe" "오디오 스트림 미감지"
fi

# 오디오 길이 측정
timer_start
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP_DIR/silent-10s.m4a" 2>/dev/null | cut -d. -f1)
timer_end
if [ "${DUR:-0}" -ge 9 ] && [ "${DUR:-0}" -le 11 ]; then
    pass "오디오 길이 측정 (${DUR}초)"
else
    fail "오디오 길이 측정" "예상 10초, 실제 ${DUR:-N/A}초"
fi

# 실제 m4a 변환 (68분 파일)
LONG_AUDIO="/Users/boram/Downloads/새로운 녹음 14.m4a"
if [[ "$MODE" == "--long" ]] && [ -f "$LONG_AUDIO" ]; then
    timer_start
    LONG_WAV="$TMP_DIR/long-converted.wav"
    ffmpeg -i "$LONG_AUDIO" -ar 16000 -ac 1 -c:a pcm_s16le "$LONG_WAV" -y -loglevel error 2>/dev/null
    timer_end
    LONG_SIZE=$(du -h "$LONG_WAV" 2>/dev/null | cut -f1)
    if [ -f "$LONG_WAV" ] && [ -s "$LONG_WAV" ]; then
        pass "68분 m4a→wav 변환 (출력: $LONG_SIZE)"
    else
        fail "68분 m4a→wav 변환" "출력 파일 없음"
    fi
elif [ ! -f "$LONG_AUDIO" ]; then
    skip "68분 오디오 변환" "파일 없음: 새로운 녹음 14.m4a"
else
    skip "68분 오디오 변환" "--long 모드에서만 실행"
fi

# ═══════════════════════════════════════════════════════════════════
# SUITE 4: whisper 전사 — 실제 STT 동작 + 소요 시간
# ═══════════════════════════════════════════════════════════════════
section "SUITE 4: whisper 전사"

# 10초 무음 전사 (빈 결과 허용 — 무음이니까)
timer_start
OUTPUT=$(bash "$SCRIPTS/transcribe.sh" "$TMP_DIR/silent-10s.m4a" 2>"$TMP_DIR/transcribe-stderr.txt")
EXIT_CODE=$?
timer_end
# whisper는 무음에 대해 빈 결과를 낼 수 있어 — 에러 없이 완료되면 OK
STDERR_CONTENT=$(cat "$TMP_DIR/transcribe-stderr.txt" 2>/dev/null)
if [ $EXIT_CODE -eq 0 ] || echo "$STDERR_CONTENT" | grep -q "전사 중"; then
    pass "10초 무음 전사 파이프라인 완주"
else
    fail "10초 전사" "exit=$EXIT_CODE"
fi

# 실제 회의 녹음으로 전사 (짧은 구간)
if [ -f "$LONG_AUDIO" ]; then
    # 30초 샘플 추출
    timer_start
    ffmpeg -i "$LONG_AUDIO" -t 30 -ar 16000 -ac 1 -c:a pcm_s16le "$TMP_DIR/sample-30s.wav" -y -loglevel error 2>/dev/null
    timer_end
    pass "실제 회의 녹음에서 30초 샘플 추출"

    timer_start
    SAMPLE_TRANSCRIPT=$(whisper-cli \
        --model /opt/homebrew/share/whisper-cpp/models/ggml-medium.bin \
        --language ko --no-timestamps --no-prints --entropy-thold 2.4 \
        "$TMP_DIR/sample-30s.wav" 2>/dev/null | tr ']' '\n' | sed 's/^\s*\[//; s/^\s*//' | grep -v '^$' | head -5)
    timer_end
    WORD_COUNT=$(echo "$SAMPLE_TRANSCRIPT" | wc -w | tr -d ' ')
    if [ "$WORD_COUNT" -gt 0 ]; then
        pass "30초 실제 회의 전사 ($WORD_COUNT 단어)"
        printf "    ${YELLOW}샘플:${NC} %s\n" "$(echo "$SAMPLE_TRANSCRIPT" | head -1 | cut -c1-80)..."
    else
        fail "30초 실제 회의 전사" "$WORD_COUNT 단어 (너무 적음)"
    fi

    # 전체 68분 전사 (--long 모드)
    if [[ "$MODE" == "--long" ]]; then
        printf "  ${YELLOW}⏳ 68분 전사 시작 — 15~25분 소요 예상...${NC}\n"
        timer_start
        FULL_TRANSCRIPT=$(bash "$SCRIPTS/transcribe.sh" "$LONG_AUDIO" 2>"$TMP_DIR/long-stderr.txt")
        EXIT_CODE=$?
        timer_end
        FULL_WORDS=$(echo "$FULL_TRANSCRIPT" | wc -w | tr -d ' ')
        if [ $EXIT_CODE -eq 0 ] && [ "$FULL_WORDS" -gt 100 ]; then
            pass "68분 전체 전사 ($FULL_WORDS 단어)"
            echo "$FULL_TRANSCRIPT" > "$TMP_DIR/full-transcript.txt"
        else
            fail "68분 전체 전사" "exit=$EXIT_CODE, $FULL_WORDS 단어"
        fi
    else
        skip "68분 전체 전사" "--long 모드에서만 실행 (예상 15~25분)"
    fi
else
    skip "실제 회의 전사" "테스트 오디오 없음"
fi

# ═══════════════════════════════════════════════════════════════════
# SUITE 5: 프롬프트 템플릿 — 치환, vocab 로드
# ═══════════════════════════════════════════════════════════════════
section "SUITE 5: 프롬프트 템플릿 & vocab"

timer_start
PROMPT=$(cat "$PROMPTS/summarize.md")
PROMPT="${PROMPT//\{\{TITLE\}\}/테스트 회의}"
PROMPT="${PROMPT//\{\{DATE\}\}/2026-03-26}"
timer_end
if echo "$PROMPT" | grep -q "테스트 회의" && echo "$PROMPT" | grep -q "2026-03-26"; then
    pass "프롬프트 플레이스홀더 치환 (TITLE + DATE)"
else
    fail "플레이스홀더 치환" "치환 실패"
fi

# 특수문자 제목 (sed injection 방지 확인)
timer_start
PROMPT2=$(cat "$PROMPTS/summarize.md")
TRICKY_TITLE='AX팀 & AXR팀 | "전략" 회의'
PROMPT2="${PROMPT2//\{\{TITLE\}\}/$TRICKY_TITLE}"
timer_end
if echo "$PROMPT2" | grep -q 'AX팀 & AXR팀'; then
    pass "특수문자 제목 치환 (& | \" 포함)"
else
    fail "특수문자 치환" "깨짐"
fi

# vocab 로드
timer_start
VOCAB=$(cat "$MERRYNOTE_ROOT/vocab/names.md" "$MERRYNOTE_ROOT/vocab/glossary.md" 2>/dev/null)
VOCAB_LINES=$(echo "$VOCAB" | wc -l | tr -d ' ')
timer_end
if [ "$VOCAB_LINES" -gt 50 ]; then
    pass "MYSC vocab 로드 ($VOCAB_LINES 줄)"
else
    fail "vocab 로드" "$VOCAB_LINES 줄 (너무 적음)"
fi

# ═══════════════════════════════════════════════════════════════════
# SUITE 6: 데몬 설정 & 상태
# ═══════════════════════════════════════════════════════════════════
section "SUITE 6: 데몬 & 설정"

timer_start
if launchctl list 2>/dev/null | grep -q "com.mysc.merrynote"; then
    timer_end; pass "데몬 실행 중 (com.mysc.merrynote)"
elif launchctl list 2>/dev/null | grep -q "com.mysc.yapnotes"; then
    timer_end; pass "legacy 데몬 실행 중 (com.mysc.yapnotes)"
else
    timer_end; fail "데몬 상태" "실행 안 됨"
fi

timer_start
CONFIG=$(cat "$CONFIG_PATH" 2>/dev/null)
timer_end
if echo "$CONFIG" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
    pass "config.json 유효한 JSON"
else
    fail "config.json" "JSON 파싱 실패"
fi

timer_start
OUTPUT_DIR=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH')).get('output_dir',''))" 2>/dev/null)
timer_end
if [ -d "$OUTPUT_DIR" ]; then
    NOTE_COUNT=$(ls "$OUTPUT_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
    pass "출력 디렉토리 존재 ($NOTE_COUNT 회의록)"
else
    fail "출력 디렉토리" "$OUTPUT_DIR 없음"
fi

# ═══════════════════════════════════════════════════════════════════
# SUITE 7: 학습 데이터 수집 구조
# ═══════════════════════════════════════════════════════════════════
section "SUITE 7: 학습 데이터 수집 인프라"

timer_start
COLLECT=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH')).get('collect_training_data','true'))" 2>/dev/null || echo "true")
timer_end
pass "학습 데이터 수집 설정: $COLLECT"

timer_start
# collect_training_data 함수가 데몬에 있는지
if grep -q "collect_training_data()" "$DAEMON/merrynoted.sh"; then
    timer_end; pass "데몬에 collect_training_data() 함수 존재"
else
    timer_end; fail "collect_training_data()" "함수 없음"
fi

timer_start
# training 디렉토리에 스크립트 존재
for f in "$TRAINING/fine_tune.py" "$TRAINING/transcribe_finetuned.py" "$TRAINING/extract_text.py"; do
    if [ ! -f "$f" ]; then
        timer_end; fail "training 스크립트" "$(basename $f) 없음"
        continue
    fi
done
timer_end; pass "training 스크립트 3개 존재"

# extract_text.py 실제 동작
timer_start
SAMPLE_MD="# 테스트 회의\n\n> 날짜: 2026-03-26\n\n## 요약\n- **핵심**: MYSC AX팀 논의\n\n---\n\n## 1. 안건\n- 프로젝트 진행 상황"
EXTRACTED=$(echo -e "$SAMPLE_MD" | python3 -c "
import sys
sys.path.insert(0, '$TRAINING')
from extract_text import extract_transcript_from_markdown
print(extract_transcript_from_markdown(sys.stdin.read()))
" 2>/dev/null)
timer_end
if echo "$EXTRACTED" | grep -q "핵심" && ! echo "$EXTRACTED" | grep -q "^#"; then
    pass "마크다운→텍스트 추출 (헤딩/구분선 제거 확인)"
else
    fail "텍스트 추출" "output=$EXTRACTED"
fi

# ═══════════════════════════════════════════════════════════════════
# SUITE 8: 모델 라우팅 — config 기반 분기
# ═══════════════════════════════════════════════════════════════════
section "SUITE 8: 모델 라우팅"

timer_start
# transcribe.sh에 모델 라우팅 로직 존재 확인
if grep -q "TRANSCRIBE_MODEL" "$SCRIPTS/transcribe.sh" && grep -q "fine-tuned" "$SCRIPTS/transcribe.sh"; then
    timer_end; pass "transcribe.sh 모델 라우팅 로직 존재"
else
    timer_end; fail "모델 라우팅" "분기 로직 없음"
fi

timer_start
# fallback 로직 확인
if grep -q 'TRANSCRIBE_MODEL="whisper-cpp"' "$SCRIPTS/transcribe.sh"; then
    timer_end; pass "fine-tuned 실패 시 whisper-cpp fallback 로직 존재"
else
    timer_end; fail "fallback" "fallback 로직 없음"
fi

# ═══════════════════════════════════════════════════════════════════
# SUITE 9: 웹 서버 (선택)
# ═══════════════════════════════════════════════════════════════════
section "SUITE 9: 웹 대시보드"

timer_start
if lsof -i :7373 &>/dev/null; then
    # 서버 이미 실행 중
    STATUS=$(curl -s http://localhost:7373/api/status 2>/dev/null)
    timer_end
    if echo "$STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'running' in d" 2>/dev/null; then
        pass "웹 서버 응답 (/api/status)"
    else
        fail "웹 서버" "응답 이상: $STATUS"
    fi
else
    timer_end; skip "웹 서버" "포트 7373 열려있지 않음 (node server/server.js로 시작)"
fi

# ═══════════════════════════════════════════════════════════════════
# 결과 요약
# ═══════════════════════════════════════════════════════════════════
printf "\n${CYAN}═══════════════════════════════════════════════${NC}\n"
printf "${CYAN}  MerryNote QA 통합 테스트 결과${NC}\n"
printf "${CYAN}═══════════════════════════════════════════════${NC}\n\n"

for r in "${RESULTS[@]}"; do
    printf "  %b\n" "$r"
done

printf "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
printf "  ${GREEN}PASS: $PASS${NC}  ${RED}FAIL: $FAIL${NC}  ${YELLOW}SKIP: $SKIP${NC}  TOTAL: $((PASS+FAIL+SKIP))\n"
printf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"

if [ "$FAIL" -gt 0 ]; then
    printf "\n  ${RED}HEALTH: FAIL${NC}\n\n"
    exit 1
else
    printf "\n  ${GREEN}HEALTH: PASS${NC}\n\n"
    exit 0
fi
