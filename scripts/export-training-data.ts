/**
 * MerryNote 학습 데이터 추출 — Firestore → SFT/DPO JSONL
 *
 * SFT: transcript → content 쌍 (ChatML 포맷)
 * DPO: generatedContent(rejected) vs content(chosen) 쌍
 *
 * 실행: npx tsx scripts/export-training-data.ts
 * 환경변수: FIREBASE_SERVICE_ACCOUNT (JSON 문자열)
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ── Firebase 초기화 ──────────────────────────────────────────────────────────
const sa = process.env.FIREBASE_SERVICE_ACCOUNT
if (!sa) { console.error('FIREBASE_SERVICE_ACCOUNT 환경변수가 필요합니다.'); process.exit(1) }

const app = initializeApp({ credential: cert(JSON.parse(sa)) })
const db = getFirestore(app)

// ── 시스템 프롬프트 (lib/claude.ts와 동기화) ─────────────────────────────────
const SYSTEM_PROMPT = `You are a meeting notes assistant for MYSC (임팩트 투자 회사).

Your goal is to faithfully capture WHO said WHAT and HOW the conversation unfolded — not just extract conclusions. Members' voices, questions, opinions, and exchanges are the heart of the notes.

Output in Korean, using structured markdown format with speaker attributions.`

// ── 타입 ─────────────────────────────────────────────────────────────────────
type Note = {
  title: string
  content: string
  transcript?: string
  generatedContent?: string
  isEdited?: boolean
  editDistance?: number
  qualityRating?: 'good' | 'ok' | 'poor' | null
  previousGenerations?: string[]
  contentRevisions?: { content: string; editedAt: string }[]
  createdAt?: { _seconds: number }
}

type SFTRow = {
  messages: { role: string; content: string }[]
}

type DPORow = {
  prompt: string
  chosen: string
  rejected: string
  metadata?: { source: string; qualityRating?: string; editDistance?: number }
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Firestore에서 노트 가져오는 중...')
  const snap = await db.collection('notes').orderBy('createdAt', 'desc').get()
  const notes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note & { id: string }))
  console.log(`총 ${notes.length}개 노트`)

  const sftRows: SFTRow[] = []
  const dpoRows: DPORow[] = []

  for (const note of notes) {
    // 필터: transcript 없거나 content 너무 짧으면 제외
    if (!note.transcript || note.content.length < 500) continue

    const userContent = `Title: ${note.title}\n\n## Transcript\n${note.transcript}`

    // ── SFT: 모든 유효한 노트 ──
    sftRows.push({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
        { role: 'assistant', content: note.content },
      ],
    })

    // ── DPO: 편집된 노트 (generatedContent 있고 content와 다른 경우) ──
    const prompt = JSON.stringify([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ])

    if (note.generatedContent && note.generatedContent !== note.content) {
      dpoRows.push({
        prompt,
        chosen: note.content,
        rejected: note.generatedContent,
        metadata: {
          source: 'initial_edit',
          qualityRating: note.qualityRating ?? undefined,
          editDistance: note.editDistance,
        },
      })
    }

    // ── DPO: 재생성 이전 버전들 ──
    if (note.previousGenerations?.length) {
      for (const prev of note.previousGenerations) {
        if (prev !== note.content && prev.length > 200) {
          dpoRows.push({
            prompt,
            chosen: note.content,
            rejected: prev,
            metadata: { source: 'regeneration' },
          })
        }
      }
    }

    // ── DPO: 상세 페이지 편집 이력 ──
    if (note.contentRevisions?.length) {
      const revisions = [...note.contentRevisions].sort(
        (a, b) => new Date(a.editedAt).getTime() - new Date(b.editedAt).getTime()
      )
      // 마지막 revision → rejected, 현재 content → chosen
      const lastRevision = revisions[revisions.length - 1]
      if (lastRevision.content !== note.content) {
        dpoRows.push({
          prompt,
          chosen: note.content,
          rejected: lastRevision.content,
          metadata: { source: 'post_save_edit' },
        })
      }
    }
  }

  // ── 파일 출력 ──
  const outDir = join(process.cwd(), 'training-data')
  mkdirSync(outDir, { recursive: true })

  const sftPath = join(outDir, 'merrynote-sft.jsonl')
  writeFileSync(sftPath, sftRows.map(r => JSON.stringify(r)).join('\n') + '\n')

  const dpoPath = join(outDir, 'merrynote-dpo.jsonl')
  writeFileSync(dpoPath, dpoRows.map(r => JSON.stringify(r)).join('\n') + '\n')

  console.log(`\n✅ 추출 완료!`)
  console.log(`   SFT: ${sftRows.length}건 → ${sftPath}`)
  console.log(`   DPO: ${dpoRows.length}건 → ${dpoPath}`)
  console.log(`\n📊 DPO 소스 분포:`)
  const sources = dpoRows.reduce((acc, r) => {
    const s = r.metadata?.source ?? 'unknown'
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  for (const [source, count] of Object.entries(sources)) {
    console.log(`   ${source}: ${count}건`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
