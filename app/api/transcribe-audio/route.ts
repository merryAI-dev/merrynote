// 오디오 파일 → 전사 텍스트
// Groq Whisper API 사용 (OpenAI 호환, 빠름, 무료 티어 2시간/일)
// ⚠️ GROQ_API_KEY 환경변수 필요 — AXR팀 협의 후 설정
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 120

const SUPPORTED_AUDIO = ['m4a', 'mp3', 'mp4', 'wav', 'ogg', 'flac', 'webm', 'aac', 'mpeg']
const MAX_SIZE_MB = 25  // Groq Whisper 최대 파일 크기

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY가 설정되지 않았습니다. Vercel 환경변수에 추가해주세요.' },
        { status: 503 },
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!SUPPORTED_AUDIO.includes(ext)) {
      return NextResponse.json(
        { error: `지원하지 않는 오디오 형식입니다. (지원: ${SUPPORTED_AUDIO.map(e => '.' + e).join(' ')})` },
        { status: 400 },
      )
    }

    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > MAX_SIZE_MB) {
      return NextResponse.json(
        { error: `파일이 너무 큽니다. (${sizeMB.toFixed(1)}MB / 최대 ${MAX_SIZE_MB}MB)\n긴 녹음은 분할하거나 브라우저 녹음을 사용해주세요.` },
        { status: 413 },
      )
    }

    // Groq Whisper API (OpenAI 호환 엔드포인트)
    const groqForm = new FormData()
    groqForm.append('file', file, file.name)
    groqForm.append('model', 'whisper-large-v3')
    groqForm.append('language', 'ko')  // 한국어 고정 (정확도 향상)
    groqForm.append('response_format', 'text')

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: groqForm,
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      throw new Error(`Groq API 오류: ${groqRes.status} ${errText}`)
    }

    const text = (await groqRes.text()).trim()
    if (!text) {
      return NextResponse.json({ error: '오디오에서 음성을 인식하지 못했습니다.' }, { status: 422 })
    }

    return NextResponse.json({
      text,
      name: file.name,
      sizeMB: parseFloat(sizeMB.toFixed(1)),
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '오디오 전사 오류' },
      { status: 500 },
    )
  }
}
