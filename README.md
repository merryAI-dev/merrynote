# MerryNote 🎙️

> MYSC 회의록 자동화 웹앱 — Claude + Gemini로 음성을 구조화된 회의록으로

[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel)](https://yapnotes-web.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange?logo=firebase)](https://firebase.google.com)

---

## 개요

MerryNote는 MYSC 내부용 회의록 자동화 도구입니다.
iPhone이나 PC에서 녹음 파일을 업로드하거나 직접 텍스트를 붙여넣으면, **Claude**가 MYSC 고유 용어·멤버 명단을 반영해 마크다운 형식의 구조화된 회의록을 자동으로 작성합니다.
생성된 회의록은 클라우드에 저장되고, **임베딩 기반 RAG 챗봇**으로 언제든 검색·질문할 수 있습니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 🎙️ **음성 전사** | m4a, mp3, wav, ogg 등 오디오 파일 → Gemini 1.5 Flash로 한국어 전사 |
| ⌨️ **브라우저 녹음** | Web Speech API로 실시간 음성 인식 (별도 앱 불필요) |
| 📄 **문서 업로드** | Word(.docx), PDF, txt, md 텍스트 직접 추출 |
| 🤖 **회의록 자동 생성** | Claude Sonnet이 MYSC 용어·멤버명 반영하여 회의록 작성 |
| ⚡ **긴 회의 청크 처리** | 6,000자 초과 시 Haiku 병렬 요약 → Sonnet 최종 통합 (Vercel 타임아웃 우회) |
| 👀 **사람 검수** | 생성된 회의록을 편집 후 저장 — 수정된 단어를 단어장에 자동 교정 등록 |
| 🔍 **임베딩 검색** | Gemini 임베딩(768차원) 코사인 유사도 기반 의미 검색 |
| 💬 **RAG 챗봇** | 회의록 맥락으로 Claude가 질문에 답변 + 출처 노트 표시 |
| ✏️ **회의록 수정** | 저장 후에도 제목·내용 편집 가능 |
| 📚 **단어장 관리** | 웹 UI에서 MYSC 고유 용어·멤버 명단 직접 편집 |
| 📱 **모바일 지원** | 반응형 레이아웃 — iPhone 브라우저에서 바로 사용 가능 |

---

## 기술 스택

```
Frontend       Next.js 15 (App Router) + React 19 + TypeScript
Styling        Tailwind CSS 4
Database       Firebase Firestore (노트, 단어장)
AI — 회의록    Anthropic Claude Sonnet 4.6 (생성), Haiku 4.5 (청크 요약)
AI — 전사      Google Gemini 1.5 Flash
AI — 검색      Google text-embedding-004 (768차원)
문서 파싱      mammoth (docx), pdf-parse (pdf)
배포           Vercel
```

---

## 시작하기

### 1. 저장소 클론

```bash
git clone https://github.com/merryAI-dev/merrynote.git
cd merrynote
npm install
```

### 2. 환경변수 설정

`.env.local.example`을 복사해서 `.env.local` 파일을 만들고 값을 채워주세요.

```bash
cp .env.local.example .env.local
```

```env
# ── Firebase 클라이언트 (Firebase Console > 프로젝트 설정 > 앱) ──────────────
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# ── Firebase Admin (서버 전용 — 절대 커밋 금지!) ────────────────────────────
# Firebase Console > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성
# 다운로드한 JSON 파일 내용을 한 줄로 압축해서 붙여넣기
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}

# ── Anthropic API ────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── Google Gemini API ────────────────────────────────────────────────────────
# Google AI Studio (aistudio.google.com) > Get API key
# 용도: 오디오 전사 + 임베딩 생성 (없으면 두 기능 비활성화)
GEMINI_API_KEY=AIza...
```

> ⚠️ **API 사용 전 AXR팀 협의 필수** — 보안, 비용, 사용 정책을 함께 검토해주세요.

### 3. Firebase Firestore 초기화

Firebase Console에서 Firestore를 활성화하고, `vocab` 컬렉션에 아래 문서를 수동으로 생성해주세요.

| 컬렉션 | 문서 ID | 필드 | 값 |
|--------|---------|------|----|
| `vocab` | `glossary` | `content` | 용어집 마크다운 (아래 형식 참고) |
| `vocab` | `names` | `content` | 멤버 명단 마크다운 (아래 형식 참고) |

`notes` 컬렉션은 첫 회의록 저장 시 자동으로 생성됩니다.

### 4. 로컬 실행

```bash
npm run dev
# → http://localhost:3000
```

---

## Vercel 배포

```bash
# Vercel CLI 설치
npm i -g vercel

# 프로젝트 연결
vercel link

# 환경변수 등록 (각 항목 입력 후 엔터)
vercel env add ANTHROPIC_API_KEY production
vercel env add GEMINI_API_KEY production
vercel env add FIREBASE_SERVICE_ACCOUNT production
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN production
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production
vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET production
vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID production
vercel env add NEXT_PUBLIC_FIREBASE_APP_ID production

# 배포
vercel --prod --yes
```

`vercel.json`에 API 타임아웃이 설정되어 있습니다:

| API Route | 최대 실행 시간 | 이유 |
|-----------|--------------|------|
| `/api/generate` | 300초 | 긴 회의록 생성 |
| `/api/transcribe-audio` | 120초 | Gemini 전사 |
| `/api/extract` | 60초 | 문서 파싱 |

---

## 단어장 데이터셋 관리

MerryNote는 회의록 생성 시 MYSC 고유 용어와 멤버 이름을 자동으로 반영합니다.
단어장은 **Firestore `vocab` 컬렉션**에 마크다운 형식의 텍스트로 저장됩니다.

### 저장 위치

| Firestore 문서 | 내용 |
|---------------|------|
| `vocab/glossary` | MYSC 조직·사업·임팩트투자 고유 용어 |
| `vocab/names` | 멤버 별명 ↔ 실명 매핑 |

---

### 방법 1 — 웹 UI에서 편집 (가장 쉬움)

1. MerryNote 접속 → 사이드바 **단어장** 클릭
2. `용어집` 또는 `멤버 명단` 탭 선택
3. 텍스트 에디터에서 직접 수정
4. **저장** 버튼 → 즉시 Firestore 반영, 다음 회의록 생성부터 적용

---

### 방법 2 — Firebase Console에서 직접 편집

1. [Firebase Console](https://console.firebase.google.com) → 해당 프로젝트
2. **Firestore Database** → `vocab` 컬렉션
3. `glossary` 또는 `names` 문서 클릭
4. `content` 필드 수정 후 저장

---

### 방법 3 — 스크립트로 대량 업데이트

로컬 마크다운 파일을 Firestore에 일괄 업로드할 때:

```javascript
// scripts/upload-vocab.js
const admin = require('firebase-admin')
const fs = require('fs')

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

const db = admin.firestore()
const [,, file, key] = process.argv  // node upload-vocab.js glossary.md glossary

const content = fs.readFileSync(file, 'utf-8')
db.collection('vocab').doc(key).set({
  content,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
}).then(() => {
  console.log(`✅ ${key} 업로드 완료 (${content.length}자)`)
  process.exit(0)
})
```

```bash
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}' \
  node scripts/upload-vocab.js ./vocab/glossary.md glossary

FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}' \
  node scripts/upload-vocab.js ./vocab/names.md names
```

---

### 데이터 형식

**용어집 (`vocab/glossary`)**

```markdown
# MYSC 용어집

CIC: 창업중심대학 (창업 생태계 구축 사업)
BMP: Business Management Platform — MYSC 사업 관리 플랫폼
임팩트 투자: 재무적 수익과 사회적 가치를 동시에 추구하는 투자 방식
AXR: AI Experience & Research — AI 활용 연구팀

## 음성인식 자동교정
<!-- 2026-03-18 -->
- CRC → CIC
- 며칠이 → 메씨리
```

**멤버 명단 (`vocab/names`)**

```markdown
# MYSC 멤버 명단

민욱: 민욱 Byun / Minwook Byun (대표)
보람: 보람 (기획팀)
메리: 김메리 / 투자심사역
```

> 💡 형식은 자유롭게 작성해도 됩니다. Claude가 이 내용을 시스템 프롬프트로 참고해서 회의록을 작성합니다.

---

### 음성인식 자동교정 등록

회의록 검수(Step 3) 단계에서 원본과 수정본의 차이를 자동으로 감지합니다.
수정된 단어는 체크박스로 확인 후 선택한 항목만 단어장에 저장됩니다.

```
원본:  "CRC 관련 논의에서 예산 검토..."
수정:  "CIC 관련 논의에서 예산 검토..."
                ↓ (체크박스에서 선택)
vocab/glossary에 자동 추가:
  - CRC → CIC
```

다음 회의록 생성부터 Claude가 "CRC"를 자동으로 "CIC"로 교정합니다.

---

## 업로드 플로우

```
① 입력 선택
   ├── 🎙️ 브라우저 녹음 (Web Speech API, 실시간)
   ├── 📁 파일 업로드
   │     ├── 오디오 (m4a/mp3/wav/ogg 등, 최대 4.3MB) → Gemini 전사
   │     └── 문서 (docx/pdf/txt/md) → 텍스트 추출
   └── ⌨️ 텍스트 직접 입력/붙여넣기

② 회의록 생성 (Claude SSE 스트리밍)
   ├── 6,000자 이하 → Claude Sonnet 직접 생성 (~20초)
   └── 6,000자 초과 → Haiku 병렬 요약 → Sonnet 최종 통합 (~40초)

③ 사람 검수
   ├── 제목·내용 자유 편집
   ├── 수정된 단어 자동 감지 → 체크박스로 단어장 등록 확인
   └── 저장 → Firestore 저장 + 임베딩 자동 생성
```

---

## 환경별 동작 (Graceful Degradation)

| 환경변수 | 없을 때 동작 |
|----------|------------|
| `GEMINI_API_KEY` 없음 | 오디오 전사 비활성화, 임베딩 미생성, 챗봇은 최근 3개 노트로 fallback |
| `ANTHROPIC_API_KEY` 없음 | 회의록 생성 불가 (503 반환) |
| `FIREBASE_SERVICE_ACCOUNT` 없음 | 모든 DB 작업 불가 |

---

## API 구조

```
app/api/
├── notes/
│   ├── route.ts          GET 목록 조회 / POST 저장 (임베딩 자동 생성)
│   └── [id]/route.ts     GET 단건 / PATCH 수정 / DELETE 삭제
├── generate/route.ts     POST 회의록 생성 (SSE 스트리밍)
├── transcribe-audio/     POST 오디오 파일 → 전사 텍스트
├── extract/route.ts      POST Word/PDF/텍스트 → 텍스트 추출
├── search/route.ts       GET 임베딩 벡터 검색
├── chat/route.ts         POST RAG 챗봇 (SSE 스트리밍)
└── vocab/route.ts        GET 단어장 조회 / PUT 저장
```

---

## 비용 & 무료 한도

| 서비스 | 무료 한도 | 초과 시 |
|--------|----------|---------|
| Gemini API (Google AI Studio) | 1,500 req/일 | 429 에러 반환 |
| text-embedding-004 | 1,500 req/일 | 429 에러 반환 |
| Firestore | 읽기 50,000/일, 쓰기 20,000/일 | 에러 반환 |
| Vercel Hobby | 배포 100회/일 | 배포 제한 |

Claude API는 사용량 기준 과금입니다. 팀 내부 사용 기준 **월 $2~5** 수준입니다.

> Google Cloud 프로젝트에 결제 계정이 연결되지 않은 경우, 무료 한도 초과 시 요금 청구 없이 오류만 반환됩니다.

---

## 프로젝트 구조

```
merrynote/
├── app/
│   ├── page.tsx                  대시보드 (통계)
│   ├── notes/
│   │   ├── page.tsx              회의록 목록 + 검색
│   │   └── [id]/page.tsx         회의록 뷰어 + 편집
│   ├── upload/page.tsx           업로드 위저드 (3단계)
│   ├── chat/page.tsx             RAG 챗봇
│   ├── vocab/page.tsx            단어장 편집기
│   └── api/                      API Routes
├── components/
│   └── Sidebar.tsx               반응형 사이드바 (모바일 햄버거 메뉴)
├── lib/
│   ├── firebase.ts               Firebase 클라이언트
│   ├── firebase-admin.ts         Firebase Admin (서버)
│   ├── gemini.ts                 Gemini 전사 + 임베딩
│   └── claude.ts                 Claude 회의록 생성 로직
├── .env.local.example            환경변수 예시
└── vercel.json                   Vercel 배포 설정
```

---

*Built with ❤️ by MYSC AX팀 & Merry*
