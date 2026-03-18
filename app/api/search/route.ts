import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

type NoteDoc = {
  id: string
  title?: string
  content?: string
  createdAt?: string
  [key: string]: unknown
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase()

  if (!q || q.length < 2) {
    return NextResponse.json({ error: '검색어는 2자 이상 입력해주세요.' }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const snap = await db.collection('notes').orderBy('createdAt', 'desc').limit(500).get()

    const all: NoteDoc[] = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? doc.data().createdAt,
    }))

    const results = all
      .filter(n => n.title?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q))
      .slice(0, 20)
      .map(note => {
        const idx = (note.content ?? '').toLowerCase().indexOf(q)
        const excerpt = idx >= 0
          ? '...' + note.content!.slice(Math.max(0, idx - 60), idx + 120) + '...'
          : (note.content?.slice(0, 180) ?? '') + '...'
        return { id: note.id, title: note.title, excerpt, created_at: note.createdAt }
      })

    return NextResponse.json(results)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB 오류' }, { status: 500 })
  }
}
