// Anthropic 스트리밍 래퍼 — 회의록 생성
import Anthropic from '@anthropic-ai/sdk'

// ─── 상수 ────────────────────────────────────────────────────────────────────
const CHUNK_THRESHOLD = 6000  // 이 글자 수 이상이면 청크 분할 처리
const CHUNK_SIZE = 4000       // 청크 하나당 최대 글자 수

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a meeting notes assistant for MYSC (임팩트 투자 회사).

When given a transcript, extract key information and organize it into a structured Korean markdown document.

## Output Format

\`\`\`markdown
# [Title]

> 날짜: YYYY-MM-DD
> 소요 시간: X분 (전사 기준)

## 요약
- 전체 내용을 2~4문장으로 핵심 요약

---

## 1. [Topic Section]
- Key points in logical flow

## 2. [Next Topic Section]
...

---

## 결정 사항
- Confirmed decisions (if any)

## 액션 아이템
- [ ] 담당자: 할 일 (if any)

## 미결 사항 / 추가 논의 필요
- Unresolved items (if any)
\`\`\`

## Core Principles
1. Context-driven organization — understand overall flow, structure logically
2. Detailed yet accurate — include all important content, remove chatter/repetition
3. Faithful to source — do not distort speakers' intent
4. Term correction — fix speech-recognition errors using the MYSC vocabulary
5. Bold emphasis on key concepts, numbers, decisions
6. Use tables for comparisons and classifications
7. Speaker attribution when distinguishable
8. Clearly separate decided vs unresolved items
9. Number sections for easy reference
10. Output in Korean (matching transcript language)

Return ONLY the markdown content, no other text.`

// ─── 짧은 전사본: 단일 스트리밍 ──────────────────────────────────────────────
export async function* streamMeetingNotes(
  title: string,
  transcript: string,
  durationMin: number,
  vocab: string,
): AsyncGenerator<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY가 없습니다.')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const today = new Date().toISOString().slice(0, 10)

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Title: ${title}\nDate: ${today}\nDuration: ${durationMin}분\n\n## MYSC Vocabulary Reference\n${vocab || '(없음)'}\n\n## Transcript\n${transcript}`,
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

// Haiku로 청크 하나 요약 (빠름, 저렴)
async function summarizeChunk(chunk: string, vocab: string, client: Anthropic): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `다음 회의 전사의 핵심 내용을 간결한 불릿 포인트로 추출해줘. 결정사항과 액션아이템 포함.\nMYSC 용어: ${vocab || '없음'}\n\n${chunk}`,
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
): AsyncGenerator<ChunkedEvent> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY가 없습니다.')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const chunks = splitTranscript(transcript)

  yield { type: 'progress', text: `전사본을 ${chunks.length}개 파트로 나눠서 처리 중...` }

  // Phase 1: 모든 청크 병렬 요약 (Haiku, ~5s)
  const summaries = await Promise.all(
    chunks.map(chunk => summarizeChunk(chunk, vocab, client)),
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
      content: `Title: ${title}\nDate: ${today}\nDuration: ${durationMin}분\n\n## MYSC Vocabulary Reference\n${vocab || '(없음)'}\n\n## 파트별 핵심 내용 (전체 전사에서 추출)\n${combinedBullets}\n\n위 핵심 내용을 바탕으로 완전한 회의록을 작성해줘.`,
    }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { type: 'content', text: event.delta.text }
    }
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
