import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('notes')
      .select('id, title, word_count, duration_min, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'DB 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, content, transcript, audio_url, word_count, duration_min } = body

    if (!title || !content) {
      return NextResponse.json({ error: 'title과 content는 필수입니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('notes')
      .insert({ title, content, transcript, audio_url, word_count, duration_min })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'DB 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
