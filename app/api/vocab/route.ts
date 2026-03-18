import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

export async function GET() {
  try {
    const db = getAdminDb()
    const [glossaryDoc, namesDoc] = await Promise.all([
      db.collection('vocab').doc('glossary').get(),
      db.collection('vocab').doc('names').get(),
    ])
    return NextResponse.json({
      glossary: glossaryDoc.data()?.content ?? '',
      names: namesDoc.data()?.content ?? '',
    })
  } catch {
    return NextResponse.json({ glossary: '', names: '' })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { key, content } = await req.json()

    if (!['glossary', 'names'].includes(key)) {
      return NextResponse.json(
        { error: 'key는 glossary 또는 names여야 합니다.' },
        { status: 400 },
      )
    }

    const db = getAdminDb()
    await db.collection('vocab').doc(key).set({ content, updatedAt: new Date() })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '저장 오류' },
      { status: 500 },
    )
  }
}
