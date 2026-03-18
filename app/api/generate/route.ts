import { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  needsChunking,
  streamMeetingNotes,
  streamChunkedMeetingNotes,
  generateFilename,
  inferTitle,
} from '@/lib/claude'

export const runtime = 'nodejs'
export const maxDuration = 300  // Vercel Pro: 최대 300초

export async function POST(req: NextRequest) {
  try {
    const { transcript, title: rawTitle, durationMin = 0 } = await req.json()

    if (!transcript || transcript.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: '전사 텍스트가 없습니다.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Firestore에서 단어장 로드
    const db = getAdminDb()
    const [glossaryDoc, namesDoc] = await Promise.all([
      db.collection('vocab').doc('glossary').get(),
      db.collection('vocab').doc('names').get(),
    ])
    const vocab = [glossaryDoc.data()?.content ?? '', namesDoc.data()?.content ?? '']
      .join('\n\n').trim()

    const title = rawTitle?.trim() || inferTitle(transcript)
    const filename = generateFilename(title)
    const chunked = needsChunking(transcript)

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

        try {
          send({ type: 'meta', title, filename, chunked })

          if (chunked) {
            // ── 청크 분할 모드 (긴 전사본) ──────────────────────────────
            let fullContent = ''
            for await (const ev of streamChunkedMeetingNotes(title, transcript, durationMin, vocab)) {
              if (ev.type === 'progress') {
                send({ type: 'progress', text: ev.text })
              } else {
                fullContent += ev.text
                send({ type: 'delta', text: ev.text })
              }
            }
            const wordCount = fullContent.split(/\s+/).filter(Boolean).length
            send({ type: 'done', wordCount, content: fullContent })

          } else {
            // ── 단일 스트리밍 (짧은 전사본) ─────────────────────────────
            let fullContent = ''
            for await (const text of streamMeetingNotes(title, transcript, durationMin, vocab)) {
              fullContent += text
              send({ type: 'delta', text })
            }
            const wordCount = fullContent.split(/\s+/).filter(Boolean).length
            send({ type: 'done', wordCount, content: fullContent })
          }

        } catch (err) {
          send({ type: 'error', message: err instanceof Error ? err.message : '생성 오류' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : '오류' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
