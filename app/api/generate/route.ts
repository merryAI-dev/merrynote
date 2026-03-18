import { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { streamMeetingNotes, generateFilename, inferTitle } from '@/lib/claude'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { transcript, title: rawTitle, durationMin = 0 } = body

    if (!transcript || transcript.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: '전사 텍스트가 없습니다.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Firestore에서만 단어장 로드 (파일 시스템 X)
    const db = getAdminDb()
    const [glossaryDoc, namesDoc] = await Promise.all([
      db.collection('vocab').doc('glossary').get(),
      db.collection('vocab').doc('names').get(),
    ])
    const vocab = [
      glossaryDoc.data()?.content ?? '',
      namesDoc.data()?.content ?? '',
    ].join('\n\n').trim()

    const title = rawTitle?.trim() || inferTitle(transcript)
    const filename = generateFilename(title)

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 첫 이벤트: 제목 + 파일명 전달
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'meta', title, filename })}\n\n`,
            ),
          )

          let fullContent = ''
          for await (const chunk of streamMeetingNotes(title, transcript, durationMin, vocab)) {
            fullContent += chunk
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`,
              ),
            )
          }

          const wordCount = fullContent.split(/\s+/).filter(Boolean).length
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'done', wordCount, content: fullContent })}\n\n`,
            ),
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : '생성 오류'
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message })}\n\n`,
            ),
          )
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
