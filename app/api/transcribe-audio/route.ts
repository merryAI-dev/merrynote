// 오디오 파일 → 전사 텍스트 (Gemini 1.5 Flash)
// 파일은 Firebase Storage URL로 전달 (Vercel 4.5MB 제한 우회)
import { NextRequest, NextResponse } from 'next/server'
import { transcribeAudio } from '@/lib/gemini'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const SUPPORTED = ['m4a', 'mp3', 'mp4', 'wav', 'ogg', 'flac', 'webm', 'aac', 'caf']

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 503 },
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!SUPPORTED.includes(ext)) {
      return NextResponse.json(
        { error: `지원하지 않는 형식입니다. (지원: ${SUPPORTED.map(e => '.' + e).join(' ')})` },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const sizeMB = buffer.length / (1024 * 1024)

    const text = await transcribeAudio(buffer, file.name)
    if (!text) {
      return NextResponse.json({ error: '오디오에서 음성을 인식하지 못했습니다.' }, { status: 422 })
    }

    return NextResponse.json({ text, name: file.name, sizeMB: parseFloat(sizeMB.toFixed(1)) })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '오디오 전사 오류' },
      { status: 500 },
    )
  }
}
