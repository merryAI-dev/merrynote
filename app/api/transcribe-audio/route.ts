// 오디오 파일 → 전사 텍스트 (Gemini 2.5 Flash)
// 두 가지 모드:
//   1. FormData { file } — 소용량(≤4.3MB) 직접 업로드
//   2. JSON { url, filename } — Vercel Blob URL (대용량 우회)
import { NextRequest, NextResponse } from 'next/server'
import { transcribeAudio } from '@/lib/gemini'
import { getAdminDb } from '@/lib/firebase-admin'

// 단어장의 "from → to" 패턴으로 전사 텍스트 후처리
function applyVocabCorrections(text: string, vocabContent: string): string {
  let result = text
  for (const line of vocabContent.split('\n')) {
    const m = line.match(/^(.+?)\s*→\s*(.+)$/)
    if (m) {
      const from = m[1].trim()
      const to = m[2].trim()
      if (from && to && from !== to) {
        result = result.replaceAll(from, to)
      }
    }
  }
  return result
}

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const SUPPORTED = ['m4a', 'mp3', 'mp4', 'wav', 'ogg', 'flac', 'webm', 'aac', 'caf', 'mpeg']

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 503 },
      )
    }

    const contentType = req.headers.get('content-type') ?? ''
    let buffer: Buffer
    let filename: string
    let sizeMB: number

    if (contentType.includes('application/json')) {
      // ── 모드 2: Blob URL ──────────────────────────────────────────────────
      const { url, filename: fn } = await req.json() as { url: string; filename: string }
      if (!url) return NextResponse.json({ error: 'url이 없습니다.' }, { status: 400 })

      filename = fn ?? url.split('/').pop() ?? 'audio'
      const ext = filename.split('.').pop()?.toLowerCase() ?? ''
      if (!SUPPORTED.includes(ext)) {
        return NextResponse.json(
          { error: `지원하지 않는 형식입니다. (지원: ${SUPPORTED.map(e => '.' + e).join(' ')})` },
          { status: 400 },
        )
      }

      const audioRes = await fetch(url)
      if (!audioRes.ok) throw new Error(`오디오 다운로드 실패 (${audioRes.status})`)
      buffer = Buffer.from(await audioRes.arrayBuffer())
      sizeMB = buffer.length / (1024 * 1024)
    } else {
      // ── 모드 1: FormData 직접 업로드 ─────────────────────────────────────
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

      filename = file.name
      const ext = filename.split('.').pop()?.toLowerCase() ?? ''
      if (!SUPPORTED.includes(ext)) {
        return NextResponse.json(
          { error: `지원하지 않는 형식입니다. (지원: ${SUPPORTED.map(e => '.' + e).join(' ')})` },
          { status: 400 },
        )
      }

      buffer = Buffer.from(await file.arrayBuffer())
      sizeMB = buffer.length / (1024 * 1024)
    }

    // names.md에서 이름 목록 추출 (Gemini 프롬프트 주입용)
    let participantNames: string[] = []
    let vocabContent = ''
    try {
      const db = getAdminDb()
      const [glossaryDoc, namesDoc] = await Promise.all([
        db.collection('vocab').doc('glossary').get(),
        db.collection('vocab').doc('names').get(),
      ])
      vocabContent = [glossaryDoc.data()?.content ?? '', namesDoc.data()?.content ?? ''].join('\n')
      // names.md에서 실명과 별명 추출 (| 실명 | 별명 | 형태)
      const namesContent = namesDoc.data()?.content ?? ''
      const nameSet = new Set<string>()
      for (const line of namesContent.split('\n')) {
        const m = line.match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/)
        if (m && !m[1].includes('실명') && !m[1].includes('---')) {
          nameSet.add(m[1].trim())
          if (m[2].trim() && m[2].trim() !== '-') nameSet.add(m[2].trim())
        }
      }
      participantNames = [...nameSet]
    } catch { /* 단어장 로드 실패해도 계속 진행 */ }

    const rawText = await transcribeAudio(buffer, filename, participantNames)
    if (!rawText) {
      return NextResponse.json({ error: '오디오에서 음성을 인식하지 못했습니다.' }, { status: 422 })
    }

    // 단어장 후처리
    let text = rawText
    if (vocabContent.trim()) text = applyVocabCorrections(rawText, vocabContent)

    return NextResponse.json({ text, rawText, name: filename, sizeMB: parseFloat(sizeMB.toFixed(1)) })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '오디오 전사 오류' },
      { status: 500 },
    )
  }
}
