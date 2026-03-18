import { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { generateEmbedding, cosineSimilarity } from '@/lib/gemini'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json() as { messages: ChatMessage[] }
    const lastUserMsg = messages.filter(m => m.role === 'user').at(-1)?.content ?? ''

    const db = getAdminDb()

    // ── 1. 관련 회의록 검색 ───────────────────────────────────────────────────
    let sources: { id: string; title: string; score: number; date: string; content?: string }[] = []
    let contextMd = ''

    if (process.env.GEMINI_API_KEY && lastUserMsg) {
      try {
        const [queryEmb, snap] = await Promise.all([
          generateEmbedding(lastUserMsg),
          db.collection('notes').orderBy('createdAt', 'desc').limit(500).get(),
        ])

        sources = snap.docs
          .map(doc => {
            const d = doc.data()
            const emb = d.embedding as number[] | null
            const score = emb?.length ? cosineSimilarity(queryEmb, emb) : 0
            return {
              id: doc.id,
              title: d.title ?? '(제목 없음)',
              content: d.content ?? '',
              score,
              date: d.createdAt?.toDate?.()?.toISOString().slice(0, 10) ?? '',
            }
          })
          .filter(n => n.score > 0.58)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)

        contextMd = sources.length
          ? sources.map(n => `### ${n.title} (${n.date})\n${n.content}`).join('\n\n---\n\n')
          : ''
      } catch { /* 임베딩 실패 → context 없이 진행 */ }
    }

    if (!contextMd) {
      // 임베딩 없이 최근 회의록 3개를 기본 컨텍스트로
      const snap = await db.collection('notes').orderBy('createdAt', 'desc').limit(3).get()
      contextMd = snap.docs.map(doc => {
        const d = doc.data()
        return `### ${d.title ?? '(제목 없음)'}\n${(d.content ?? '').slice(0, 1500)}`
      }).join('\n\n---\n\n')
    }

    // ── 2. Claude 스트리밍 ────────────────────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const systemPrompt = `당신은 MYSC(임팩트 투자 회사)의 회의록 도우미 Merry입니다.
아래 회의록을 바탕으로 질문에 친절하고 간결하게 답변해주세요.
회의록에 없는 내용은 "회의록에서 찾지 못했어요"라고 솔직하게 말해주세요.
답변은 한국어로, 마크다운 형식으로 작성해주세요.

${contextMd ? `## 관련 회의록\n\n${contextMd}` : '## 참고할 회의록\n(관련 회의록을 찾지 못했습니다. 일반적인 질문에는 답변할 수 있어요.)'}`

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

        try {
          // 소스 먼저 전송
          send({
            type: 'sources',
            sources: sources.map(s => ({ id: s.id, title: s.title, score: s.score, date: s.date })),
          })

          const claudeStream = client.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            system: systemPrompt,
            messages,
          })

          for await (const event of claudeStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              send({ type: 'delta', text: event.delta.text })
            }
          }

          send({ type: 'done' })
        } catch (err) {
          send({ type: 'error', message: err instanceof Error ? err.message : '오류' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : '오류' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
