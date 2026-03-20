import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getAdminDb()
    const doc = await db.collection('jobs').doc(id).get()

    if (!doc.exists) {
      return NextResponse.json({ error: 'Job을 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({ id: doc.id, ...doc.data() })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB 오류' }, { status: 500 })
  }
}
