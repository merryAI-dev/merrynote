import { NextRequest, NextResponse } from 'next/server'
import { transcribeAudio } from '@/lib/whisper'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5분 타임아웃 (긴 오디오 대응)

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('audio') as File | null

    if (!file) {
      return NextResponse.json({ error: '오디오 파일이 없습니다.' }, { status: 400 })
    }

    const allowedTypes = ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'video/mp4', 'video/quicktime']
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(m4a|mp3|wav|aiff|aac|mp4|mov)$/i)) {
      return NextResponse.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 })
    }

    const start = Date.now()
    const transcript = await transcribeAudio(file, file.name)
    const durationSec = Math.round((Date.now() - start) / 1000)

    return NextResponse.json({
      transcript,
      wordCount: transcript.split(/\s+/).filter(Boolean).length,
      processingTimeSec: durationSec,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '전사 중 오류가 발생했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
