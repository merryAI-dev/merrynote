/**
 * Whisper + pyannote 화자분리 서비스 클라이언트
 * Docker whisper-diarize 서비스에 오디오를 보내고 전사 + 화자 세그먼트를 받음
 */

import { SpeakerSegment } from './parse-segments'

const WHISPER_URL = process.env.WHISPER_DIARIZE_URL || 'http://localhost:8000'
const HF_TOKEN = process.env.HF_TOKEN || ''
const TIMEOUT_MS = 600_000  // 10분 (cold start + 전사 대응)

// HF Space가 paused 상태면 resume 요청
const HF_SPACE_ID = 'boramintheMYSC/merrynote-whisper-diarize'

async function ensureSpaceRunning(): Promise<void> {
  if (!HF_TOKEN || !WHISPER_URL.includes('hf.space')) return

  // health check로 상태 확인
  try {
    const res = await fetch(`${WHISPER_URL}/health`, { signal: AbortSignal.timeout(10_000) })
    if (res.ok) return // 이미 실행 중
  } catch { /* paused 또는 starting */ }

  // HF API로 resume 요청
  console.log('Whisper Space가 정지 상태입니다. 깨우는 중...')
  const resumeRes = await fetch(
    `https://huggingface.co/api/spaces/${HF_SPACE_ID}/restart`,
    { method: 'POST', headers: { Authorization: `Bearer ${HF_TOKEN}` } },
  )
  if (!resumeRes.ok) {
    console.warn(`Space resume 실패: ${resumeRes.status}`)
  }

  // 실행될 때까지 대기 (최대 5분)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const res = await fetch(`${WHISPER_URL}/health`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        console.log('Whisper Space 준비 완료!')
        return
      }
    } catch { /* 아직 시작 중 */ }
    if (i % 6 === 5) console.log(`  Space 시작 대기 중... (${Math.floor((i + 1) * 5 / 60)}분)`)
  }
  throw new Error('Whisper Space가 5분 내에 시작되지 않았습니다')
}

export type WhisperResult = {
  text: string
  speakerSegments: SpeakerSegment[]
  language?: string
  duration?: number
}

export async function transcribeWithWhisper(
  audioBuffer: Buffer,
  filename: string,
  participantNames?: string[],
): Promise<WhisperResult> {
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(audioBuffer)])
  formData.append('file', blob, filename)
  if (participantNames?.length) {
    formData.append('participant_names', JSON.stringify(participantNames))
  }

  // HF Space가 paused면 자동으로 깨움
  await ensureSpaceRunning()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${WHISPER_URL}/transcribe`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`Whisper 서비스 오류 (${res.status}): ${err}`)
    }

    const data = await res.json()

    return {
      text: data.text ?? '',
      speakerSegments: (data.speakerSegments ?? []).map((s: Record<string, unknown>) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        speaker: String(s.speaker || 'Speaker 1'),
        text: String(s.text || ''),
      })),
      language: data.language,
      duration: data.duration,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function checkWhisperHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${WHISPER_URL}/health`, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch {
    return false
  }
}
