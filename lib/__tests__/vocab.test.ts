import { describe, it, expect } from 'vitest'
import { applyVocabCorrections, parseNames, extractSpeakerNames } from '../vocab'

describe('applyVocabCorrections', () => {
  it('"from → to" 패턴으로 교정한다', () => {
    const vocab = '마이에스씨 → MYSC\n엑스트라마일 → 엑스트라마일임팩트'
    expect(applyVocabCorrections('마이에스씨 회의', vocab)).toBe('MYSC 회의')
  })

  it('여러 교정을 동시 적용한다', () => {
    const vocab = '에이블 → 에이블\nAXR → AXR팀'
    const result = applyVocabCorrections('에이블과 AXR 논의', vocab)
    expect(result).toBe('에이블과 AXR팀 논의')
  })

  it('빈 단어장이면 원본 그대로 반환', () => {
    expect(applyVocabCorrections('원본 텍스트', '')).toBe('원본 텍스트')
    expect(applyVocabCorrections('원본 텍스트', '\n\n')).toBe('원본 텍스트')
  })

  it('동일 from/to는 무시한다', () => {
    const vocab = 'MYSC → MYSC'
    expect(applyVocabCorrections('MYSC 회의', vocab)).toBe('MYSC 회의')
  })

  it('→ 패턴이 아닌 줄은 무시한다', () => {
    const vocab = '## 제목\n- 항목\nMYSC → 엠와이에스씨'
    expect(applyVocabCorrections('MYSC', vocab)).toBe('엠와이에스씨')
  })
})

describe('parseNames', () => {
  it('마크다운 테이블에서 이름/별명을 추출한다', () => {
    const content = `| 실명 | 별명 |
| --- | --- |
| 김정태 | 에이블 |
| 이예지 | 메씨리 |`
    const result = parseNames(content)
    expect(result).toEqual([
      { name: '김정태', alias: '에이블' },
      { name: '이예지', alias: '메씨리' },
    ])
  })

  it('헤더와 구분선은 무시한다', () => {
    const content = `| 실명 | 별명 |
| --- | --- |
| 홍길동 | 길동 |`
    expect(parseNames(content)).toHaveLength(1)
  })

  it('별명이 "-"인 경우 제외한다', () => {
    const content = `| 실명 | 별명 |
| --- | --- |
| 홍길동 | - |`
    expect(parseNames(content)).toEqual([])
  })
})

describe('extractSpeakerNames', () => {
  it('실명과 별명을 모두 포함한다', () => {
    const content = `| 실명 | 별명 |
| --- | --- |
| 김정태 | 에이블 |`
    const names = extractSpeakerNames(content)
    expect(names).toContain('김정태')
    expect(names).toContain('에이블')
  })
})
