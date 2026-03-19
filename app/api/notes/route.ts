import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { generateEmbedding } from '@/lib/gemini'
import { extractStructured } from '@/lib/claude'

export async function GET() {
  try {
    const db = getAdminDb()
    const snap = await db.collection('notes').orderBy('createdAt', 'desc').get()

    const notes = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      embedding: undefined,  // 목록 응답에서 임베딩 벡터 제외 (용량 절감)
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? doc.data().createdAt,
    }))

    return NextResponse.json(notes)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB 오류' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, content, transcript, audio_url, word_count, duration_min, speaker_map, speaker_segments } = body

    if (!title || !content) {
      return NextResponse.json({ error: 'title과 content는 필수입니다.' }, { status: 400 })
    }

    const db = getAdminDb()

    // 임베딩 생성 + 구조화 추출 병렬 실행
    let embedding: number[] | null = null
    let structured = null

    await Promise.all([
      process.env.GEMINI_API_KEY
        ? generateEmbedding(`${title}\n\n${content}`)
            .then(e => { embedding = e })
            .catch(() => {})
        : Promise.resolve(),
      process.env.ANTHROPIC_API_KEY
        ? extractStructured(content)
            .then(s => { structured = s })
            .catch(() => {})
        : Promise.resolve(),
    ])

    const ref = await db.collection('notes').add({
      title,
      content,
      transcript: transcript ?? null,
      audioUrl: audio_url ?? null,
      wordCount: word_count ?? null,
      durationMin: duration_min ?? null,
      embedding: embedding ?? null,  // 768차원 벡터 또는 null
      structured: structured ?? null,
      speakerMap: speaker_map ?? null,
      speakerSegments: speaker_segments ?? null,
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ id: ref.id }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB 오류' }, { status: 500 })
  }
}
