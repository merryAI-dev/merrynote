import { NextRequest, NextResponse } from 'next/server'
import { generateMeetingNotes, generateFilename, inferTitle } from '@/lib/claude'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { transcript, title: rawTitle, durationMin = 0 } = body

    if (!transcript || transcript.trim().length < 10) {
      return NextResponse.json({ error: '전사 텍스트가 없습니다.' }, { status: 400 })
    }

    const title = rawTitle?.trim() || inferTitle(transcript)
    const content = await generateMeetingNotes(title, transcript, durationMin)
    const filename = generateFilename(title)
    const wordCount = content.split(/\s+/).filter(Boolean).length

    return NextResponse.json({ title, content, filename, wordCount })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '회의록 생성 중 오류가 발생했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
