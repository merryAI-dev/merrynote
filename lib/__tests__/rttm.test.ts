import { describe, it, expect } from 'vitest'
import { segmentsToRTTM, generateUEM, generateDatabaseYml } from '../rttm'

describe('segmentsToRTTM', () => {
  it('segments를 RTTM 형식으로 변환한다', () => {
    const segments = [
      { start: 0.5, end: 2.8, speaker: 'Speaker 1', text: '안녕하세요' },
      { start: 3.168, end: 9.1, speaker: 'Speaker 2', text: '네 반갑습니다' },
    ]
    const result = segmentsToRTTM(segments, {}, 'meeting_001')
    expect(result).toBe(
      'SPEAKER meeting_001 1 0.500 2.300 <NA> <NA> Speaker 1 <NA> <NA>\n' +
      'SPEAKER meeting_001 1 3.168 5.932 <NA> <NA> Speaker 2 <NA> <NA>'
    )
  })

  it('speakerMap으로 이름을 치환한다', () => {
    const segments = [
      { start: 0, end: 10, speaker: 'Speaker 1', text: '테스트' },
    ]
    const map = { 'Speaker 1': '보람' }
    const result = segmentsToRTTM(segments, map, 'mtg')
    expect(result).toContain('보람')
    expect(result).not.toContain('Speaker 1')
  })

  it('빈 segments는 빈 문자열을 반환한다', () => {
    expect(segmentsToRTTM([], {}, 'empty')).toBe('')
  })
})

describe('generateUEM', () => {
  it('파일 전체 구간 UEM을 생성한다', () => {
    const result = generateUEM('meeting_001', 300)
    expect(result).toBe('meeting_001 NA 0.000 300.000')
  })
})

describe('generateDatabaseYml', () => {
  it('pyannote database.yml 구조를 생성한다', () => {
    const result = generateDatabaseYml('/data')
    expect(result).toContain('MerryNote')
    expect(result).toContain('/data/audio/{uri}.wav')
    expect(result).toContain('/data/rttm/{uri}.rttm')
    expect(result).toContain('SpeakerDiarization')
  })
})
