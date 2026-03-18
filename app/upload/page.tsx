'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Stage = 'idle' | 'recording' | 'transcribed' | 'generating' | 'saving' | 'done' | 'error'

export default function UploadPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [title, setTitle] = useState('')
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [recordingTime, setRecordingTime] = useState(0)
  const [result, setResult] = useState<{ id: string } | null>(null)
  const [error, setError] = useState('')
  const [supported, setSupported] = useState(true)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fullTextRef = useRef('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSpeechRecognition = (): any => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  useEffect(() => {
    if (!getSpeechRecognition()) setSupported(false)
  }, [])

  const startRecording = () => {
    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition() // eslint-disable-line @typescript-eslint/no-unsafe-call
    recognition.lang = 'ko-KR'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    fullTextRef.current = ''

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          fullTextRef.current += t + ' '
        } else {
          interim += t
        }
      }
      setTranscript(fullTextRef.current)
      setInterimText(interim)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech') {
        setError(`음성 인식 오류: ${e.error}`)
        setStage('error')
      }
    }

    recognition.onend = () => {
      // continuous 모드에서 자동 재시작 (stop 버튼 누르기 전까지)
      if (recognitionRef.current) {
        try { recognition.start() } catch {}
      }
    }

    recognition.start()
    recognitionRef.current = recognition
    setStage('recording')
    setRecordingTime(0)
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    if (timerRef.current) clearInterval(timerRef.current)
    setInterimText('')
    setStage('transcribed')
  }

  const generate = async () => {
    if (!transcript.trim()) return
    setError('')

    try {
      setStage('generating')
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, title: title.trim() || undefined }),
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.error)

      setStage('saving')
      const saveRes = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: genData.title,
          content: genData.content,
          transcript,
          word_count: genData.wordCount,
        }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) throw new Error(saveData.error)

      setResult({ id: saveData.id })
      setStage('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
      setStage('error')
    }
  }

  const reset = () => {
    setStage('idle')
    setTitle('')
    setTranscript('')
    setInterimText('')
    setResult(null)
    setError('')
    fullTextRef.current = ''
  }

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  if (stage === 'done' && result) {
    return (
      <div style={{ padding: '2rem', maxWidth: '640px' }}>
        <div style={{
          background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.3)',
          borderRadius: '10px', padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>회의록 생성 완료!</div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.25rem' }}>
            <button onClick={() => router.push(`/notes/${result.id}`)} style={{
              padding: '0.6rem 1.5rem', background: 'var(--amber)', color: '#000',
              border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer',
            }}>
              회의록 보기 →
            </button>
            <button onClick={reset} style={{
              padding: '0.6rem 1.25rem', background: 'var(--bg-hover)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer',
            }}>
              새로 시작
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '680px' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--amber)', marginBottom: '0.25rem' }}>
          회의록 만들기
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          녹음하거나 전사 텍스트를 붙여넣으면 Claude가 회의록으로 정리해줍니다
        </p>
      </div>

      {!supported && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '6px', padding: '0.875rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#ef4444',
        }}>
          이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Safari를 사용해주세요.
        </div>
      )}

      {/* 제목 */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
          회의 제목 (선택)
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="입력하지 않으면 내용에서 자동 추출"
          disabled={stage === 'recording'}
          style={{
            width: '100%', padding: '0.625rem 0.875rem',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text)', fontSize: '0.875rem', outline: 'none',
          }}
        />
      </div>

      {/* 녹음 버튼 */}
      {stage !== 'transcribed' && stage !== 'generating' && stage !== 'saving' && (
        <div style={{
          background: 'var(--bg-card)', border: `1px solid ${stage === 'recording' ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
          borderRadius: '10px', padding: '1.5rem', textAlign: 'center', marginBottom: '1rem',
        }}>
          {stage === 'recording' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                <span style={{ fontWeight: 600, color: '#ef4444' }}>녹음 중</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginLeft: '0.25rem' }}>{formatTime(recordingTime)}</span>
              </div>
              <button onClick={stopRecording} style={{
                padding: '0.75rem 2rem', background: '#ef4444', color: '#fff',
                border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
              }}>
                ⏹ 녹음 중지
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎙️</div>
              <button onClick={startRecording} disabled={!supported} style={{
                padding: '0.75rem 2rem',
                background: supported ? 'var(--amber)' : 'var(--bg-hover)',
                color: supported ? '#000' : 'var(--text-muted)',
                border: 'none', borderRadius: '8px', fontWeight: 700,
                cursor: supported ? 'pointer' : 'not-allowed', fontSize: '0.9rem',
              }}>
                ⏺ 녹음 시작
              </button>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                Chrome · Edge · Safari 지원 · 한국어 자동 인식
              </div>
            </>
          )}
        </div>
      )}

      {/* 전사 텍스트 영역 */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
          전사 텍스트 {stage === 'recording' && <span style={{ color: '#ef4444' }}>● 실시간 인식 중</span>}
        </label>
        <textarea
          value={transcript + (interimText ? interimText : '')}
          onChange={e => { if (stage !== 'recording') { setTranscript(e.target.value); fullTextRef.current = e.target.value } }}
          placeholder="녹음하거나 여기에 전사 텍스트를 직접 붙여넣으세요"
          readOnly={stage === 'recording'}
          style={{
            width: '100%', height: '200px',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '0.875rem',
            color: stage === 'recording' ? 'var(--text)' : 'var(--text)',
            fontSize: '0.85rem', lineHeight: '1.7',
            resize: 'vertical', outline: 'none', fontFamily: 'inherit',
          }}
        />
        {transcript && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {transcript.split(/\s+/).filter(Boolean).length} 단어
          </div>
        )}
      </div>

      {/* 오류 */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '6px', padding: '0.875rem', marginBottom: '1rem',
          fontSize: '0.875rem', color: '#ef4444',
        }}>
          {error}
        </div>
      )}

      {/* 진행 상태 */}
      {(stage === 'generating' || stage === 'saving') && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: '6px', padding: '0.875rem', marginBottom: '1rem',
          fontSize: '0.875rem', color: 'var(--amber)',
        }}>
          {stage === 'generating' ? '📝 Claude가 회의록을 작성하고 있습니다...' : '💾 저장 중...'}
        </div>
      )}

      {/* 생성 버튼 */}
      {stage !== 'recording' && (
        <button
          onClick={generate}
          disabled={!transcript.trim() || stage === 'generating' || stage === 'saving'}
          style={{
            width: '100%', padding: '0.75rem',
            background: transcript.trim() && stage !== 'generating' && stage !== 'saving' ? 'var(--amber)' : 'var(--bg-hover)',
            color: transcript.trim() && stage !== 'generating' && stage !== 'saving' ? '#000' : 'var(--text-muted)',
            border: 'none', borderRadius: '8px', fontWeight: 700,
            cursor: transcript.trim() ? 'pointer' : 'not-allowed', fontSize: '0.9rem',
          }}
        >
          {stage === 'generating' ? 'Claude 작성 중...' : stage === 'saving' ? '저장 중...' : '📝 회의록 생성 →'}
        </button>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
