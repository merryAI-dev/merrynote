/**
 * Whisper + pyannote 화자분리 서비스 클라이언트
 * Docker whisper-diarize 서비스에 오디오를 보내고 전사 + 화자 세그먼트를 받음
 */

import { SpeakerSegment } from './parse-segments'

const WHISPER_URL = process.env.WHISPER_DIARIZE_URL || 'http://localhost:8000'
const TIMEOUT_MS = 300_000  // 5분 (긴 회의 대응)

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
