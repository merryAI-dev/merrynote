// Google Gemini — 오디오 전사 + 임베딩 생성
import { GoogleGenerativeAI } from '@google/generative-ai'

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.')
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
}

// 오디오 MIME 타입 매핑
const AUDIO_MIME: Record<string, string> = {
  m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg',
  wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
  webm: 'audio/webm', aac: 'audio/aac', caf: 'audio/x-caf',
}

// ─── 오디오 → 전사 텍스트 (Gemini 1.5 Flash) ─────────────────────────────────
export async function transcribeAudio(buffer: Buffer, filename: string, participantNames?: string[]): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'm4a'
  const mimeType = AUDIO_MIME[ext] ?? 'audio/mp4'
  const sizeMB = buffer.length / (1024 * 1024)

  // Gemini inline data 제한: ~20MB
  if (sizeMB > 19) {
    throw new Error(`파일이 너무 큽니다 (${sizeMB.toFixed(1)}MB / 최대 19MB).`)
  }

  const model = getClient().getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent([
    {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType,
      },
    },
    `이 오디오를 한국어로 전사해줘. 반드시 다음 규칙을 따라:

1. 화자가 바뀔 때마다 새 줄로 구분하고 아래 형식으로 출력해:
[MM:SS Speaker N] 발화 내용

예시:
[00:12 Speaker 1] 오늘 안건은 세 가지입니다.
[00:45 Speaker 2] 네, 첫 번째부터 시작하죠.

2. 타임스탬프는 대략적이어도 괜찮아. 화자 번호는 목소리 톤과 발화 패턴으로 구분해.
3. 같은 화자가 계속 말하면 한 블록으로 묶어도 돼.
4. 설명이나 주석 없이 전사 내용만 출력해.${participantNames && participantNames.length > 0 ? `\n5. 참고: 이 회의 참석 가능한 사람들은 ${participantNames.join(', ')} 입니다. 문맥으로 화자를 추론할 때 참고해.` : ''}`,
  ])

  return result.response.text().trim()
}

// ─── 텍스트 → 임베딩 벡터 (text-embedding-004, 768차원) ──────────────────────
export async function generateEmbedding(text: string): Promise<number[]> {
  // 토큰 제한 대비 앞부분만 사용 (8000자 ≈ 2000 토큰)
  const truncated = text.slice(0, 8000)
  const model = getClient().getGenerativeModel({ model: 'text-embedding-004' })
  const result = await model.embedContent(truncated)
  return result.embedding.values
}

// ─── 코사인 유사도 ─────────────────────────────────────────────────────────────
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}
