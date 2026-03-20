import { describe, it, expect } from 'vitest'
import { parseSegments, buildSpeakerMap } from '../parse-segments'

describe('parseSegments', () => {
  it('정상 [MM:SS Speaker N] 패턴을 파싱한다', () => {
    const text = `[00:12 Speaker 1] 오늘 안건은 세 가지입니다.
[00:45 Speaker 2] 네, 첫 번째부터 시작하죠.
[01:30 Speaker 1] 좋습니다. 다음으로 넘어가겠습니다.`

    const result = parseSegments(text)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({
      start: 12, end: 45, speaker: 'Speaker 1', text: '오늘 안건은 세 가지입니다.',
    })
    expect(result[1]).toEqual({
      start: 45, end: 90, speaker: 'Speaker 2', text: '네, 첫 번째부터 시작하죠.',
    })
    expect(result[2]).toEqual({
      start: 90, end: 120, speaker: 'Speaker 1', text: '좋습니다. 다음으로 넘어가겠습니다.',
    })
  })

  it('빈 입력은 빈 배열을 반환한다', () => {
    expect(parseSegments('')).toEqual([])
    expect(parseSegments('   \n\n  ')).toEqual([])
  })

  it('타임스탬프 없는 줄은 무시한다', () => {
    const text = `일반 텍스트입니다.
[00:12 Speaker 1] 이건 파싱됩니다.
또 일반 텍스트.`
    const result = parseSegments(text)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('이건 파싱됩니다.')
  })

  it('한국어 "화자 N" 패턴을 지원한다', () => {
    const text = `[00:00 화자 1] 안녕하세요.
[00:10 화자 2] 네, 반갑습니다.`
    const result = parseSegments(text)
    expect(result).toHaveLength(2)
    expect(result[0].speaker).toBe('화자 1')
  })

  it('마지막 세그먼트의 end는 start+30이다', () => {
    const text = '[05:00 Speaker 1] 마지막 발언입니다.'
    const result = parseSegments(text)
    expect(result[0].end).toBe(330) // 300 + 30
  })
})

describe('buildSpeakerMap', () => {
  it('quote 매칭으로 화자 이름을 매핑한다', () => {
    const segments = [
      { start: 0, end: 10, speaker: 'Speaker 1', text: '오늘 안건은 세 가지입니다.' },
      { start: 10, end: 20, speaker: 'Speaker 2', text: '네, 첫 번째부터 시작하죠.' },
    ]
    const mappings = [
      { quote: '오늘 안건은 세 가지입니다.', speaker: '보람' },
      { quote: '네, 첫 번째부터 시작하죠.', speaker: '메씨리' },
    ]
    const map = buildSpeakerMap(mappings, segments)
    expect(map).toEqual({ 'Speaker 1': '보람', 'Speaker 2': '메씨리' })
  })

  it('빈 speaker는 무시한다', () => {
    const segments = [{ start: 0, end: 10, speaker: 'Speaker 1', text: '테스트' }]
    const mappings = [{ quote: '테스트', speaker: '' }]
    const map = buildSpeakerMap(mappings, segments)
    expect(map).toEqual({})
  })
})
