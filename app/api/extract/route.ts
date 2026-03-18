import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPPORTED = ['txt', 'md', 'docx', 'pdf']

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!SUPPORTED.includes(ext)) {
      return NextResponse.json(
        { error: `지원하지 않는 형식입니다. (지원: ${SUPPORTED.map(e => '.' + e).join(', ')})` },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    let text = ''

    if (ext === 'txt' || ext === 'md') {
      text = buffer.toString('utf-8')

    } else if (ext === 'docx') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value

    } else if (ext === 'pdf') {
      // pdf-parse/lib 직접 import — Next.js 환경에서 test 파일 참조 오류 우회
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js')
      const result = await pdfParse(buffer)
      text = result.text
    }

    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

    if (!text) {
      return NextResponse.json({ error: '파일에서 텍스트를 추출할 수 없습니다.' }, { status: 422 })
    }

    return NextResponse.json({ text, name: file.name, ext })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '파일 추출 오류' },
      { status: 500 },
    )
  }
}
