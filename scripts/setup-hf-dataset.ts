/**
 * MerryNote HF Dataset 레포 초기화
 * merryAI-dev/merrynote-training-data (private) 생성
 *
 * 실행 (1회만): npx tsx scripts/setup-hf-dataset.ts
 * 환경변수: HF_TOKEN
 */

const HF_TOKEN = process.env.HF_TOKEN
if (!HF_TOKEN) { console.error('HF_TOKEN 환경변수가 필요합니다.'); process.exit(1) }

const REPO_ID = 'merryAI-dev/merrynote-training-data'
const API = 'https://huggingface.co/api'
const headers = { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' }

async function createRepo() {
  console.log(`Dataset 레포 생성: ${REPO_ID}`)
  const res = await fetch(`${API}/repos/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'dataset',
      name: REPO_ID.split('/')[1],
      organization: REPO_ID.split('/')[0],
      private: true,
    }),
  })
  if (res.ok) {
    console.log('레포 생성 완료!')
  } else if (res.status === 409) {
    console.log('레포가 이미 존재합니다.')
  } else {
    const text = await res.text()
    throw new Error(`레포 생성 실패 (${res.status}): ${text}`)
  }
}

async function uploadFile(path: string, content: string, message: string) {
  const res = await fetch(
    `${API}/datasets/${REPO_ID}/upload/main/${path}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/octet-stream' },
      body: content,
    },
  )
  if (!res.ok) {
    // commit API 방식으로 재시도
    const commitRes = await fetch(`${API}/datasets/${REPO_ID}/commit/main`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        summary: message,
        files: [{ path, content: Buffer.from(content).toString('base64'), encoding: 'base64' }],
      }),
    })
    if (!commitRes.ok) {
      console.warn(`${path} 업로드 실패 — 수동으로 추가해주세요`)
      return
    }
  }
  console.log(`  ${path} 업로드 완료`)
}

async function main() {
  await createRepo()

  const readme = `---
license: mit
language:
  - ko
tags:
  - meeting-notes
  - sft
  - dpo
  - merrynote
size_categories:
  - n<1K
---

# MerryNote Training Data

MYSC 회의록 자동 생성 서비스(MerryNote)의 학습 데이터셋.

## 구조

- \`sft/train.jsonl\` — SFT 데이터 (transcript → 회의록, ChatML 포맷)
- \`dpo/train.jsonl\` — DPO 데이터 (chosen/rejected 쌍)

## 자동 업데이트

매주 월요일 GitHub Actions에서 Firestore → 이 Dataset으로 자동 동기화.
사용자의 회의록 교정이 곧 학습 데이터.
`

  console.log('\n초기 파일 업로드:')
  await uploadFile('README.md', readme, '초기 Dataset 카드')
  await uploadFile('sft/train.jsonl', '', 'SFT 데이터 폴더 초기화')
  await uploadFile('dpo/train.jsonl', '', 'DPO 데이터 폴더 초기화')

  console.log(`\n✅ 완료! https://huggingface.co/datasets/${REPO_ID}`)
}

main().catch(e => { console.error(e); process.exit(1) })
