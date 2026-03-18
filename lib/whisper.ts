// OpenAI Whisper API 래퍼
// AXR팀 승인 후 OPENAI_API_KEY 환경변수 설정 필요

export async function transcribeAudio(file: File | Blob, filename = 'audio.m4a'): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다. AXR팀 승인 후 .env.local에 추가해주세요.')
  }

  const formData = new FormData()
  formData.append('file', file, filename)
  formData.append('model', 'whisper-1')
  formData.append('language', 'ko')
  formData.append('response_format', 'text')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Whisper API 오류: ${res.status} ${err}`)
  }

  const text = await res.text()
  return text.trim()
}
