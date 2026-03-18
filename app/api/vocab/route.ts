import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const VOCAB_DIR = path.join(process.cwd(), 'vocab')

export async function GET() {
  const glossary = fs.existsSync(path.join(VOCAB_DIR, 'glossary.md'))
    ? fs.readFileSync(path.join(VOCAB_DIR, 'glossary.md'), 'utf-8')
    : ''
  const names = fs.existsSync(path.join(VOCAB_DIR, 'names.md'))
    ? fs.readFileSync(path.join(VOCAB_DIR, 'names.md'), 'utf-8')
    : ''

  return NextResponse.json({ glossary, names })
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { key, content } = body

    if (!['glossary', 'names'].includes(key)) {
      return NextResponse.json({ error: 'key는 glossary 또는 names여야 합니다.' }, { status: 400 })
    }

    fs.mkdirSync(VOCAB_DIR, { recursive: true })
    fs.writeFileSync(path.join(VOCAB_DIR, `${key}.md`), content, 'utf-8')

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '저장 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
