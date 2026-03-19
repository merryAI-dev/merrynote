// Gemini 전사 결과에서 [MM:SS Speaker N] 패턴을 파싱해 speakerSegments 추출

export type SpeakerSegment = {
  start: number    // 초 단위
  end: number      // 초 단위 (다음 세그먼트 시작 또는 마지막)
  speaker: string  // "Speaker 1", "Speaker 2" 등
  text: string     // 발화 내용
}

const PATTERN = /^\[(\d{1,2}):(\d{2})\s+(Speaker\s*\d+|화자\s*\d+)\]\s*(.+)/i

function parseTime(min: string, sec: string): number {
  return parseInt(min, 10) * 60 + parseInt(sec, 10)
}

export function parseSegments(transcript: string): SpeakerSegment[] {
  const lines = transcript.split('\n').filter(l => l.trim())
  const segments: SpeakerSegment[] = []

  for (const line of lines) {
    const m = line.trim().match(PATTERN)
    if (m) {
      segments.push({
        start: parseTime(m[1], m[2]),
        end: 0, // 아래에서 채움
        speaker: m[3].replace(/\s+/g, ' ').trim(),
        text: m[4].trim(),
      })
    }
  }

  // end 시간 채우기: 다음 세그먼트 시작 시간 또는 +30초
  for (let i = 0; i < segments.length; i++) {
    segments[i].end = i < segments.length - 1
      ? segments[i + 1].start
      : segments[i].start + 30
  }

  return segments
}

// speakerMap 생성: 화자 매핑에서 { "Speaker 1": "보람" } 형태로 변환
export function buildSpeakerMap(
  mappings: { quote: string; speaker: string }[],
  segments: SpeakerSegment[],
): Record<string, string> {
  const map: Record<string, string> = {}

  for (const m of mappings) {
    if (!m.speaker.trim()) continue
    // 매핑의 quote가 어떤 segment에 가장 가까운지 찾기
    const seg = segments.find(s => s.text.includes(m.quote.slice(0, 30)))
    if (seg && !map[seg.speaker]) {
      map[seg.speaker] = m.speaker.trim()
    }
  }

  return map
}
