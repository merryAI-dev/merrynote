#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# MerryNote 원클릭 설치 스크립트
#
# 사용법:
#   curl -fsSL https://raw.githubusercontent.com/merryAI-dev/merrynote/main/install.sh | bash
# ─────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}$*${RESET}"; }
success() { echo -e "${GREEN}✅ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠️  $*${RESET}"; }
error()   { echo -e "${RED}❌ $*${RESET}"; exit 1; }

echo ""
info "🎙️  MerryNote 설치 시작"
info "================================================="
echo ""

# ── macOS 확인 ────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
  error "MerryNote는 macOS 전용입니다."
fi

# ── Node.js 확인 ─────────────────────────────────────────
if ! command -v node &>/dev/null; then
  warn "Node.js가 없습니다."
  if command -v brew &>/dev/null; then
    info "Homebrew로 Node.js를 설치합니다..."
    brew install node
  else
    error "Node.js를 먼저 설치해주세요: https://nodejs.org/"
  fi
fi

NODE_VER=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 16 ]; then
  error "Node.js 16 이상이 필요합니다. 현재: v$NODE_VER"
fi
success "Node.js v$NODE_VER"

# ── npm 확인 ─────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  error "npm을 찾을 수 없습니다. Node.js를 재설치해주세요."
fi

# ── fswatch 확인 ─────────────────────────────────────────
if ! command -v fswatch &>/dev/null; then
  warn "fswatch가 없습니다."
  if command -v brew &>/dev/null; then
    info "fswatch 설치 중..."
    brew install fswatch
    success "fswatch 설치 완료"
  else
    warn "fswatch 없이는 실시간 감시가 불가능합니다."
    warn "나중에 brew install fswatch 로 설치하세요."
  fi
else
  success "fswatch $(fswatch --version | head -1 | awk '{print $2}')"
fi

# ── MerryNote 설치 ───────────────────────────────────────
info "\nMerryNote 설치 중..."
if [ -f "$SCRIPT_DIR/package.json" ]; then
  info "현재 체크아웃을 전역 설치합니다..."
  npm install -g "$SCRIPT_DIR"
elif ! npm install -g merrynote; then
  warn "npm의 merrynote 패키지를 찾지 못해 legacy 패키지(yapnotes)로 폴백합니다."
  npm install -g yapnotes
fi
success "MerryNote 설치 완료"

echo ""
info "이제 설치 설정을 시작합니다..."
echo ""

# ── 설치 실행 ────────────────────────────────────────────
if command -v merrynote &>/dev/null; then
  merrynote
else
  yapnotes
fi
