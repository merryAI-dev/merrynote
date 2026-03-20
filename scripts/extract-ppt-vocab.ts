/**
 * pptMaker + vocab 데이터에서 학습 데이터 추출
 * - names.md → speakers.json (89명 화자 목록)
 * - glossary.md → terms.json (도메인 용어)
 * - pptMaker/fewshot_examples.json → corrections.json (교정 규칙)
 * - pptMaker 마스터시트.csv → 담당자별 매핑
 *
 * 실행: npx tsx scripts/extract-ppt-vocab.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { parseNames } from '../lib/vocab'

const OUT_DIR = './training-data/vocab'
const VOCAB_DIR = './vocab'
const PPT_DIR = '/Users/boram/Desktop/11월/pptMaker'

// ── 1. names.md → speakers.json ──────────────────────────────
function extractSpeakers() {
  const content = readFileSync(`${VOCAB_DIR}/names.md`, 'utf-8')
  const names = parseNames(content)
  writeFileSync(`${OUT_DIR}/speakers.json`, JSON.stringify(names, null, 2))
  console.log(`✅ speakers.json: ${names.length}명 추출`)
  return names
}

// ── 2. glossary.md → terms.json ──────────────────────────────
function extractTerms() {
  const content = readFileSync(`${VOCAB_DIR}/glossary.md`, 'utf-8')
  const terms: { category: string; terms: string[] }[] = []
  let currentCategory = ''
  let currentTerms: string[] = []

  for (const line of content.split('\n')) {
    if (line.startsWith('##')) {
      if (currentCategory && currentTerms.length > 0) {
        terms.push({ category: currentCategory, terms: currentTerms })
      }
      currentCategory = line.replace(/^#+\s*/, '').trim()
      currentTerms = []
    } else {
      // **단어** 형태 추출
      const matches = line.match(/\*\*(.+?)\*\*/g)
      if (matches) {
        for (const m of matches) {
          currentTerms.push(m.replace(/\*\*/g, ''))
        }
      }
    }
  }
  if (currentCategory && currentTerms.length > 0) {
    terms.push({ category: currentCategory, terms: currentTerms })
  }

  const totalTerms = terms.reduce((acc, t) => acc + t.terms.length, 0)
  writeFileSync(`${OUT_DIR}/terms.json`, JSON.stringify(terms, null, 2))
  console.log(`✅ terms.json: ${terms.length} 카테고리, ${totalTerms}개 용어`)
  return terms
}

// ── 3. fewshot_examples.json → corrections.json ──────────────
function extractCorrections() {
  const path = `${PPT_DIR}/fewshot_examples.json`
  if (!existsSync(path)) {
    console.log('⚠️ fewshot_examples.json 없음 — 건너뜀')
    return []
  }

  const data = JSON.parse(readFileSync(path, 'utf-8'))
  const corrections: { from: string; to: string; category: string }[] = []

  const positives = data.positive_examples ?? data.positives ?? []
  for (const ex of positives) {
    if (ex.before && ex.after && ex.before !== ex.after) {
      corrections.push({
        from: ex.before,
        to: ex.after,
        category: ex.category ?? 'unknown',
      })
    }
  }

  writeFileSync(`${OUT_DIR}/corrections.json`, JSON.stringify(corrections, null, 2))
  console.log(`✅ corrections.json: ${corrections.length}개 교정 규칙`)
  return corrections
}

// ── 4. 마스터시트 CSV → 담당자 매핑 ─────────────────────────
function extractMasterSheet() {
  const csvFiles = [
    `${PPT_DIR}/26년(14기) H-온드림 제안서 마스터시트 - 보람 작업용.csv`,
  ]

  for (const csvPath of csvFiles) {
    if (!existsSync(csvPath)) {
      console.log(`⚠️ CSV 없음: ${csvPath}`)
      continue
    }

    const content = readFileSync(csvPath, 'utf-8')
    const lines = content.split('\n')
    const assignees = new Set<string>()

    for (const line of lines) {
      const cols = line.split(',')
      // 담당자 컬럼 찾기 (보통 첫 몇 열)
      for (const col of cols) {
        const trimmed = col.trim().replace(/"/g, '')
        // 한글 2~4자 이름 패턴
        if (/^[가-힣]{2,4}$/.test(trimmed) || /^(데일리|스템|숲|데\/스)$/.test(trimmed)) {
          assignees.add(trimmed)
        }
      }
    }

    console.log(`✅ 마스터시트 담당자: ${[...assignees].join(', ')}`)
  }
}

// ── 실행 ─────────────────────────────────────────────────────
console.log('=== MerryNote 학습 데이터 추출 시작 ===\n')

const speakers = extractSpeakers()
const terms = extractTerms()
const corrections = extractCorrections()
extractMasterSheet()

// 전체 데이터셋 인덱스 생성
const dataset = {
  createdAt: new Date().toISOString(),
  speakers: { count: speakers.length, file: 'vocab/speakers.json' },
  terms: { count: terms.reduce((a, t) => a + t.terms.length, 0), file: 'vocab/terms.json' },
  corrections: { count: corrections.length, file: 'vocab/corrections.json' },
}
writeFileSync('./training-data/dataset.json', JSON.stringify(dataset, null, 2))

console.log('\n=== 추출 완료! ===')
console.log(`📁 training-data/vocab/ 에 저장됨`)
