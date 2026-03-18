import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ error: '검색어는 2자 이상 입력해주세요.' }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('notes')
      .select('id, title, content, created_at')
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error

    // 검색어 주변 excerpt 추출
    const results = (data || []).map((note) => {
      const idx = note.content.toLowerCase().indexOf(q.toLowerCase())
      const excerpt = idx >= 0
        ? '...' + note.content.slice(Math.max(0, idx - 60), idx + 120) + '...'
        : note.content.slice(0, 180) + '...'
      return { id: note.id, title: note.title, excerpt, created_at: note.created_at }
    })

    return NextResponse.json(results)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'DB 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
