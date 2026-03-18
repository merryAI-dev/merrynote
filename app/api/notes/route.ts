import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

export async function GET() {
  try {
    const db = getAdminDb()
    const snap = await db.collection('notes')
      .orderBy('createdAt', 'desc')
      .get()

    const notes = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
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
    const { title, content, transcript, audio_url, word_count, duration_min } = body

    if (!title || !content) {
      return NextResponse.json({ error: 'title과 content는 필수입니다.' }, { status: 400 })
    }

    const db = getAdminDb()
    const ref = await db.collection('notes').add({
      title,
      content,
      transcript: transcript ?? null,
      audioUrl: audio_url ?? null,
      wordCount: word_count ?? null,
      durationMin: duration_min ?? null,
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ id: ref.id }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB 오류' }, { status: 500 })
  }
}
