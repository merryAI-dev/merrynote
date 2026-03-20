// 단어장 파싱 및 후처리 유틸리티

/** "from → to" 패턴으로 전사 텍스트 후처리 */
export function applyVocabCorrections(text: string, vocabContent: string): string {
  let result = text
  for (const line of vocabContent.split('\n')) {
    const m = line.match(/^(.+?)\s*→\s*(.+)$/)
    if (m) {
      const from = m[1].trim()
      const to = m[2].trim()
      if (from && to && from !== to) {
        result = result.replaceAll(from, to)
      }
    }
  }
  return result
}

/** names.md 마크다운 테이블에서 실명/별명 추출 */
export function parseNames(content: string): { name: string; alias: string }[] {
  const results: { name: string; alias: string }[] = []
  for (const line of content.split('\n')) {
    const m = line.match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/)
    if (m && !m[1].includes('실명') && !m[1].includes('---') && !m[1].includes('--')) {
      const name = m[1].trim()
      const alias = m[2].trim()
      if (name && alias && alias !== '-') {
        results.push({ name, alias })
      }
    }
  }
  return results
}

/** 화자 이름 목록 추출 (실명 + 별명 통합) */
export function extractSpeakerNames(namesContent: string): string[] {
  const names = parseNames(namesContent)
  const set = new Set<string>()
  for (const { name, alias } of names) {
    set.add(name)
    set.add(alias)
  }
  return [...set]
}
