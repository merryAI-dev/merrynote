// Anthropic 스트리밍 래퍼 — 회의록 생성
import Anthropic from '@anthropic-ai/sdk'

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

export async function* streamMeetingNotes(
  title: string,
  transcript: string,
  durationMin: number,
  vocab: string,
): AsyncGenerator<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.')
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const today = new Date().toISOString().slice(0, 10)

  const userMessage = `Title: ${title}
Date: ${today}
Duration: ${durationMin}분 (전사 기준)

## MYSC Vocabulary Reference
${vocab || '(단어장 없음)'}

## Transcript
${transcript}`

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text
    }
  }
}

export function inferTitle(transcript: string): string {
  const snippet = transcript.slice(0, 200).replace(/\n/g, ' ')
  return snippet.length > 50 ? snippet.slice(0, 50) + '...' : snippet || '회의'
}

export function generateFilename(title: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const slug = title
    .replace(/[^\w\s가-힣]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
  return `${today}-${slug}.md`
}
