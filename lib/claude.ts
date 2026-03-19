// Anthropic 스트리밍 래퍼 — 회의록 생성
import Anthropic from '@anthropic-ai/sdk'

// ─── 상수 ────────────────────────────────────────────────────────────────────
const CHUNK_THRESHOLD = 6000  // 이 글자 수 이상이면 청크 분할 처리
const CHUNK_SIZE = 4000       // 청크 하나당 최대 글자 수

type SpeakerMapping = { quote: string; speaker: string }

function buildSpeakerHint(mappings: SpeakerMapping[]): string {
  if (!mappings || mappings.length === 0) return ''
  const lines = mappings.map(m => `- "${m.quote.slice(0, 60)}..." → ${m.speaker}`)
  return `\n\n## 발화자 매핑 힌트\n아래 발언들이 각 발화자와 매핑됩니다. 전사 전반에서 이 패턴을 활용해 발화자를 식별해줘:\n${lines.join('\n')}`
}

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a meeting notes assistant for MYSC (임팩트 투자 회사).

Your goal is to faithfully capture WHO said WHAT and HOW the conversation unfolded — not just extract conclusions. Members' voices, questions, opinions, and exchanges are the heart of the notes.

## Output Format

\`\`\`markdown
# [Title]

> 날짜: YYYY-MM-DD
> 소요 시간: X분
> 참석자: [이름들 — 전사에서 식별된 경우]

## 전체 흐름 요약
- 이 회의에서 어떤 주제들이 어떤 순서로 논의됐는지 3~5문장으로 서술
- 누가 어떤 방향을 이끌었는지 포함

---

## 1. [주제명]

### 논의 내용
[발화자명]: 발언 내용 — 중요한 발언은 최대한 원문에 가깝게 보존
[발화자명]: 이에 대한 반응, 질문, 추가 의견
...

> 💬 핵심 교환: 이 섹션에서 가장 중요한 의견 대립/합의/질문을 1~2줄로 요약

## 2. [다음 주제명]
...

---

## 결정 사항
- **[담당자]**: 결정 내용

## 액션 아이템
- [ ] **[담당자]**: 할 일 · 기한(있는 경우)

## 미결 사항 / 추가 논의 필요
- 내용 — 누가 제기했는지 포함
\`\`\`

## Core Principles
1. **사람 중심** — 누가 어떤 말을 했는지가 핵심. 발화자를 최대한 명시하고, 발언을 압축보다 보존 우선
2. **대화의 흐름 유지** — 질문-답변, 의견 충돌, 합의 과정을 생략하지 말고 서술
3. **중요 발언은 원문 가깝게** — 핵심 발언은 요약하지 말고 최대한 그대로 기록
4. **발화자 불명 시** — "A(추정)", "참석자" 등으로 표기
5. Term correction — fix speech-recognition errors using the MYSC vocabulary
6. Bold emphasis on key names, numbers, decisions
7. Use tables for comparisons/data when helpful
8. Clearly separate decided vs unresolved items
9. Output in Korean (matching transcript language)
10. Return ONLY the markdown content, no other text`

// ─── 짧은 전사본: 단일 스트리밍 ──────────────────────────────────────────────
export async function* streamMeetingNotes(
  title: string,
  transcript: string,
  durationMin: number,
  vocab: string,
  speakerMappings: SpeakerMapping[] = [],
): AsyncGenerator<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY가 없습니다.')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const today = new Date().toISOString().slice(0, 10)
  const speakerHint = buildSpeakerHint(speakerMappings)

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Title: ${title}\nDate: ${today}\nDuration: ${durationMin}분\n\n## MYSC Vocabulary Reference\n${vocab || '(없음)'}${speakerHint}\n\n## Transcript\n${transcript}`,
    }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

// ─── 청크 분할 유틸 ───────────────────────────────────────────────────────────
export function needsChunking(transcript: string): boolean {
  return transcript.length > CHUNK_THRESHOLD
}

function splitTranscript(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text]

  const chunks: string[] = []
  let remaining = text.trim()

  while (remaining.length > CHUNK_SIZE) {
    const slice = remaining.slice(0, CHUNK_SIZE)
    // 자연스러운 문장 경계에서 자르기
    const boundary = Math.max(
      slice.lastIndexOf('.\n'),
      slice.lastIndexOf('다.\n'),
      slice.lastIndexOf('요.\n'),
      slice.lastIndexOf('\n\n'),
      slice.lastIndexOf('. '),
    )
    const cutAt = boundary > CHUNK_SIZE * 0.5 ? boundary + 1 : CHUNK_SIZE
    chunks.push(remaining.slice(0, cutAt).trim())
    remaining = remaining.slice(cutAt).trim()
  }

  if (remaining) chunks.push(remaining)
  return chunks
}

// Sonnet으로 청크 하나 요약 (품질 우선)
async function summarizeChunk(chunk: string, vocab: string, participants: string, client: Anthropic): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `다음 회의 전사 파트에서 아래 내용을 추출해줘:
1. 누가 어떤 말을 했는지 — 발화자명과 핵심 발언 (원문 가깝게 보존)
2. 주요 질문과 그에 대한 답변/반응
3. 의견 차이나 합의가 있었다면 그 흐름
4. 결정사항 및 액션아이템 (담당자 포함)

압축보다 대화의 맥락을 살려줘.
${participants ? `참석자 이름 목록: ${participants} — 이 이름들을 발화자 매핑에 적극 활용해줘.` : ''}
MYSC 용어: ${vocab || '없음'}

${chunk}`,
    }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text : ''
}

// ─── 긴 전사본: 청크 분할 → 병렬 요약 → Sonnet 스트리밍 ──────────────────────
// yield 타입: 진행 메시지 | 콘텐츠 델타
export type ChunkedEvent =
  | { type: 'progress'; text: string }
  | { type: 'content'; text: string }

export async function* streamChunkedMeetingNotes(
  title: string,
  transcript: string,
  durationMin: number,
  vocab: string,
  speakerMappings: SpeakerMapping[] = [],
): AsyncGenerator<ChunkedEvent> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY가 없습니다.')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const chunks = splitTranscript(transcript)
  const participants = speakerMappings.map(m => m.speaker).filter(Boolean).join(', ')
  const speakerHint = buildSpeakerHint(speakerMappings)

  yield { type: 'progress', text: `전사본을 ${chunks.length}개 파트로 나눠서 처리 중...` }

  // Phase 1: 모든 청크 병렬 요약 (Sonnet)
  const summaries = await Promise.all(
    chunks.map(chunk => summarizeChunk(chunk, vocab, participants, client)),
  )

  yield { type: 'progress', text: `파트 요약 완료 · 최종 회의록 작성 중...` }

  // Phase 2: 요약들로 최종 회의록 스트리밍 (Sonnet)
  const today = new Date().toISOString().slice(0, 10)
  const combinedBullets = summaries
    .map((s, i) => `### 파트 ${i + 1}\n${s}`)
    .join('\n\n')

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Title: ${title}\nDate: ${today}\nDuration: ${durationMin}분\n\n## MYSC Vocabulary Reference\n${vocab || '(없음)'}${speakerHint}\n\n## 파트별 핵심 내용 (전체 전사에서 추출)\n${combinedBullets}\n\n위 핵심 내용을 바탕으로 완전한 회의록을 작성해줘.`,
    }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { type: 'content', text: event.delta.text }
    }
  }
}

// ─── 구조화 추출 (Haiku — 결정/액션/주제) ────────────────────────────────────
export interface Structured {
  decisions: string[]
  actions: { owner: string; task: string }[]
  agenda: string[]
}

export async function extractStructured(content: string): Promise<Structured | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `다음 회의록에서 아래 JSON 형식으로 정보를 추출해줘. JSON만 출력하고 다른 텍스트는 절대 쓰지 마.\n\n형식:\n{"decisions":["결정사항"],"actions":[{"owner":"담당자","task":"할 일"}],"agenda":["논의 주제"]}\n\n회의록:\n${content.slice(0, 6000)}`,
      }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0]) as Structured
  } catch {
    return null
  }
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
export function inferTitle(transcript: string): string {
  const snippet = transcript.slice(0, 200).replace(/\n/g, ' ')
  return snippet.length > 50 ? snippet.slice(0, 50) + '...' : snippet || '회의'
}

export function generateFilename(title: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const slug = title.replace(/[^\w\s가-힣]/g, '').trim().replace(/\s+/g, '-').slice(0, 40)
  return `${today}-${slug}.md`
}
