import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getAdminDb } from '@/lib/firebase-admin'

const VOCAB_DIR = path.join(process.cwd(), 'vocab')

export async function GET() {
  // 파일 우선, 없으면 Firestore fallback
  const fromFile = (key: string) => {
    const p = path.join(VOCAB_DIR, `${key}.md`)
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
  }

  try {
    return NextResponse.json({
      glossary: fromFile('glossary'),
      names: fromFile('names'),
    })
  } catch {
    return NextResponse.json({ glossary: '', names: '' })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { key, content } = body

    if (!['glossary', 'names'].includes(key)) {
      return NextResponse.json({ error: 'key는 glossary 또는 names여야 합니다.' }, { status: 400 })
    }

    // 파일로 저장 (로컬 개발용)
    try {
      fs.mkdirSync(VOCAB_DIR, { recursive: true })
      fs.writeFileSync(path.join(VOCAB_DIR, `${key}.md`), content, 'utf-8')
    } catch { /* Vercel 환경에서는 read-only, Firestore로 fallback */ }

    // Firestore에도 저장 (Vercel 배포 환경)
    try {
      const db = getAdminDb()
      await db.collection('vocab').doc(key).set({ content, updatedAt: new Date() })
    } catch { /* FIREBASE_SERVICE_ACCOUNT 없을 때 무시 */ }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '저장 오류' }, { status: 500 })
  }
}
