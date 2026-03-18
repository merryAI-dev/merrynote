import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { generateEmbedding, cosineSimilarity } from '@/lib/gemini'

type NoteDoc = {
  id: string
  title?: string
  content?: string
  createdAt?: string
  embedding?: number[] | null
  [key: string]: unknown
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ error: '검색어는 2자 이상 입력해주세요.' }, { status: 400 })
  }

  const db = getAdminDb()

  try {
    // ── 임베딩 검색 (GEMINI_API_KEY 있을 때) ──────────────────────────────────
    if (process.env.GEMINI_API_KEY) {
      const [queryEmbedding, snap] = await Promise.all([
        generateEmbedding(q),
        // embedding 포함해서 로드 (select로 필요한 필드만)
        db.collection('notes').orderBy('createdAt', 'desc').limit(1000).get(),
      ])

      const all: NoteDoc[] = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? doc.data().createdAt,
      }))

      // 임베딩이 있는 노트는 벡터 유사도, 없는 건 텍스트 매칭 fallback
      const scored = all.map(note => {
        const emb = note.embedding as number[] | null | undefined
        if (emb && emb.length > 0) {
          return { note, score: cosineSimilarity(queryEmbedding, emb), method: 'vector' }
        }
        // 임베딩 없는 구 노트 → 텍스트 포함 여부로 0/1 스코어
        const qLower = q.toLowerCase()
        const hit = note.title?.toLowerCase().includes(qLower) || note.content?.toLowerCase().includes(qLower)
        return { note, score: hit ? 0.6 : 0, method: 'text' }
      })

      const results = scored
        .filter(s => s.score > 0.55)                           // 유사도 임계값
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(({ note, score, method }) => {
          const qLower = q.toLowerCase()
          const idx = (note.content ?? '').toLowerCase().indexOf(qLower)
          const excerpt = idx >= 0
            ? '...' + note.content!.slice(Math.max(0, idx - 60), idx + 120) + '...'
            : (note.content?.slice(0, 180) ?? '') + '...'
          return {
            id: note.id,
            title: note.title,
            excerpt,
            created_at: note.createdAt,
            score: parseFloat(score.toFixed(3)),
            method,  // 'vector' | 'text'
          }
        })

      return NextResponse.json(results)
    }

    // ── 텍스트 fallback (GEMINI_API_KEY 없을 때) ──────────────────────────────
    const snap = await db.collection('notes').orderBy('createdAt', 'desc').limit(500).get()
    const qLower = q.toLowerCase()

    const results = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? doc.data().createdAt }))
      .filter((n: NoteDoc) => n.title?.toLowerCase().includes(qLower) || n.content?.toLowerCase().includes(qLower))
      .slice(0, 20)
      .map((note: NoteDoc) => {
        const idx = (note.content ?? '').toLowerCase().indexOf(qLower)
        const excerpt = idx >= 0
          ? '...' + note.content!.slice(Math.max(0, idx - 60), idx + 120) + '...'
          : (note.content?.slice(0, 180) ?? '') + '...'
        return { id: note.id, title: note.title, excerpt, created_at: note.createdAt, method: 'text' }
      })

    return NextResponse.json(results)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '검색 오류' }, { status: 500 })
  }
}
