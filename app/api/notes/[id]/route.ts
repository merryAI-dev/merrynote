import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { generateEmbedding } from '@/lib/gemini'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getAdminDb()
    const doc = await db.collection('notes').doc(id).get()

    if (!doc.exists) {
      return NextResponse.json({ error: '노트를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data()?.createdAt?.toDate?.()?.toISOString() ?? doc.data()?.createdAt,
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB 오류' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { title, content } = await req.json() as { title?: string; content?: string }
    if (!title?.trim()) return NextResponse.json({ error: '제목은 필수입니다.' }, { status: 400 })

    const db = getAdminDb()
    const updates: Record<string, unknown> = {
      title: title.trim(),
      content: content ?? '',
      updatedAt: new Date(),
      word_count: (content ?? '').split(/\s+/).filter(Boolean).length,
    }

    if (process.env.GEMINI_API_KEY) {
      try {
        updates.embedding = await generateEmbedding(`${title}\n\n${content}`)
      } catch { /* 임베딩 실패해도 저장은 진행 */ }
    }

    await db.collection('notes').doc(id).update(updates)
    return NextResponse.json({ id, title: updates.title, content: updates.content })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB 오류' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getAdminDb()
    await db.collection('notes').doc(id).delete()
    return new NextResponse(null, { status: 204 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB 오류' }, { status: 500 })
  }
}
