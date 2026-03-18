#!/usr/bin/env bash
# Firebase 콘솔에서 값 받아온 후 이 스크립트 실행
# https://console.firebase.google.com → Project Settings

set -euo pipefail

echo "🔧 Vercel 환경변수 설정 시작..."

# Firebase 클라이언트 설정 (Public)
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production < /dev/stdin
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN production < /dev/stdin
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production < /dev/stdin
vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET production < /dev/stdin
vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID production < /dev/stdin
vercel env add NEXT_PUBLIC_FIREBASE_APP_ID production < /dev/stdin

# Firebase Admin (Service Account JSON — 한 줄로 압축)
echo "FIREBASE_SERVICE_ACCOUNT: 서비스 계정 JSON을 한 줄로 붙여넣으세요"
vercel env add FIREBASE_SERVICE_ACCOUNT production < /dev/stdin

# OpenAI Whisper
vercel env add OPENAI_API_KEY production < /dev/stdin

# Anthropic
vercel env add ANTHROPIC_API_KEY production < /dev/stdin

echo "✅ 환경변수 설정 완료! 재배포: vercel --prod"
