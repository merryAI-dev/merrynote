// RTTM (Rich Transcription Time Marked) 변환
// pyannote speaker diarization 파인튜닝용

import type { SpeakerSegment } from './parse-segments'

/**
 * SpeakerSegment[] → RTTM 포맷 문자열
 * RTTM: SPEAKER fileId 1 start duration <NA> <NA> speakerName <NA> <NA>
 */
export function segmentsToRTTM(
  segments: SpeakerSegment[],
  speakerMap: Record<string, string>,
  fileId: string,
): string {
  return segments
    .map(seg => {
      const speaker = speakerMap[seg.speaker] ?? seg.speaker
      const duration = seg.end - seg.start
      return `SPEAKER ${fileId} 1 ${seg.start.toFixed(3)} ${duration.toFixed(3)} <NA> <NA> ${speaker} <NA> <NA>`
    })
    .join('\n')
}

/**
 * UEM (Un-partitioned Evaluation Map) 생성
 * 파일 전체 구간을 어노테이션 범위로 정의
 */
export function generateUEM(fileId: string, duration: number): string {
  return `${fileId} NA 0.000 ${duration.toFixed(3)}`
}

/**
 * pyannote database.yml 생성
 */
export function generateDatabaseYml(dataDir: string, name: string = 'MerryNote'): string {
  return `Databases:
  ${name}:
    - ${dataDir}/audio/{uri}.wav

Protocols:
  ${name}:
    SpeakerDiarization:
      Training:
        train:
          uri: ${dataDir}/train.lst
          annotation: ${dataDir}/rttm/{uri}.rttm
          annotated: ${dataDir}/uem/{uri}.uem
        development:
          uri: ${dataDir}/dev.lst
          annotation: ${dataDir}/rttm/{uri}.rttm
          annotated: ${dataDir}/uem/{uri}.uem`
}
