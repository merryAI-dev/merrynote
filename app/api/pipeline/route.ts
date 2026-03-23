// 파이프라인 대시보드용 상태 API
// 각 노드의 실시간 현황 반환

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { checkWhisperHealth } from '@/lib/whisper'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = getAdminDb()

    // Firestore 노트 통계
    const notesSnap = await db.collection('notes').orderBy('createdAt', 'desc').limit(100).get()
    const notes = notesSnap.docs.map(d => d.data())

    const totalNotes = notes.length
    const editedNotes = notes.filter(n => n.isEdited).length
    const ratedNotes = notes.filter(n => n.qualityRating).length
    const dpoReady = notes.filter(n => n.generatedContent && n.generatedContent !== n.content).length
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayNotes = notes.filter(n => {
      const d = n.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10)
      return d === todayStr
    }).length

    const recentNote = notes[0]
    const recentTitle = recentNote?.title ?? '-'
    const recentDate = recentNote?.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? '-'

    // Whisper 서비스 상태
    let whisperStatus = { online: false, model: '-', diarization: false }
    try {
      const url = process.env.WHISPER_DIARIZE_URL
      if (url) {
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) })
        if (res.ok) {
          const data = await res.json()
          whisperStatus = { online: true, model: data.whisper_model, diarization: data.diarization }
        }
      }
    } catch {}

    // HF Dataset 상태
    let hfDataset = { sftCount: 0, dpoCount: 0, repo: '-' }
    try {
      const hfToken = process.env.HF_TOKEN
      const repo = process.env.HF_DATASET_REPO || 'boramintheMYSC/merrynote-training-data'
      if (hfToken) {
        hfDataset.repo = repo
        for (const [file, key] of [['sft/train.jsonl', 'sftCount'], ['dpo/train.jsonl', 'dpoCount']] as const) {
          try {
            const url = `https://huggingface.co/datasets/${repo}/resolve/main/${file}`
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${hfToken}` },
              signal: AbortSignal.timeout(5000),
            })
            if (res.ok) {
              const text = await res.text()
              const count = text.trim().split('\n').filter(l => l.trim()).length
              hfDataset = { ...hfDataset, [key]: count }
            }
          } catch {}
        }
      }
    } catch {}

    return NextResponse.json({
      firestore: {
        totalNotes,
        todayNotes,
        editedNotes,
        ratedNotes,
        dpoReady,
        recentTitle,
        recentDate,
      },
      whisper: whisperStatus,
      hfDataset,
      kafka: {
        topic: 'training.sync',
        status: process.env.KAFKA_BOOTSTRAP ? 'configured' : 'not_configured',
      },
      training: {
        model: 'Qwen/Qwen3-8B',
        sftModel: 'merryAI-dev/merrynote-qwen3-8b-sft',
        schedule: '매주 월요일 10:00 KST',
      },
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '파이프라인 상태 조회 오류' },
      { status: 500 },
    )
  }
}
