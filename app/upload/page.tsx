'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Stage = 'idle' | 'recording' | 'transcribed' | 'streaming' | 'saving' | 'done' | 'error'

export default function UploadPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [title, setTitle] = useState('')
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [recordingTime, setRecordingTime] = useState(0)
  const [generatedContent, setGeneratedContent] = useState('')
  const [generatedTitle, setGeneratedTitle] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [result, setResult] = useState<{ id: string } | null>(null)
  const [error, setError] = useState('')
  const [supported, setSupported] = useState(true)
  const [isDragging, setIsDragging] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fullTextRef = useRef('')
  const streamBoxRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSpeechRecognition = (): any =>
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  useEffect(() => {
    if (!getSpeechRecognition()) setSupported(false)
  }, [])

  // 스트리밍 중 자동 스크롤
  useEffect(() => {
    if (stage === 'streaming' && streamBoxRef.current) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight
    }
  }, [generatedContent, stage])

  // 파일(AirDrop / 직접 업로드) → 텍스트 읽기
  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'txt' || ext === 'md') {
      const reader = new FileReader()
      reader.onload = e => {
        const text = e.target?.result as string
        fullTextRef.current = text
        setTranscript(text)
        setStage('transcribed')
      }
      reader.readAsText(file, 'utf-8')
    } else {
      setError(`지원 형식: .txt, .md (음성 파일은 브라우저 녹음을 이용해주세요)`)
    }
  }

  const startRecording = () => {
    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
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
    setGeneratedContent('')
    setGeneratedTitle('')
    setStage('streaming')

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, title: title.trim() || undefined }),
      })

      if (!res.ok || !res.body) throw new Error('스트림 연결 실패')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalContent = ''
      let finalTitle = ''
      let finalWordCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6)
          try {
            const event = JSON.parse(json)
            if (event.type === 'meta') {
              finalTitle = event.title
              setGeneratedTitle(event.title)
            } else if (event.type === 'delta') {
              finalContent += event.text
              setGeneratedContent(c => c + event.text)
            } else if (event.type === 'done') {
              finalContent = event.content
              finalWordCount = event.wordCount
            } else if (event.type === 'error') {
              throw new Error(event.message)
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue
            throw parseErr
          }
        }
      }

      setWordCount(finalWordCount)
      setStage('saving')

      const saveRes = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: finalTitle || title.trim() || '회의록',
          content: finalContent,
          transcript,
          word_count: finalWordCount,
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
    setGeneratedContent('')
    setGeneratedTitle('')
    setWordCount(0)
    setResult(null)
    setError('')
    fullTextRef.current = ''
  }

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  const isStreaming = stage === 'streaming'
  const isSaving = stage === 'saving'

  // ─── Done ───
  if (stage === 'done' && result) {
    return (
      <div style={{ padding: '2rem', maxWidth: '720px' }}>
        <div style={{
          background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.35)',
          borderRadius: '12px', padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem' }}>회의록 생성 완료!</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            {wordCount > 0 && `${wordCount.toLocaleString()} 단어`}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
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

  // ─── Streaming view ───
  if (isStreaming || isSaving) {
    return (
      <div style={{ padding: '2rem', maxWidth: '720px' }}>
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--amber)', animation: 'pulse 1s infinite', display: 'inline-block' }} />
          <span style={{ fontWeight: 600, color: 'var(--amber)' }}>
            {isSaving ? '💾 Firestore에 저장 중...' : '📝 Claude가 회의록 작성 중...'}
          </span>
          {generatedTitle && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>— {generatedTitle}</span>
          )}
        </div>
        <div
          ref={streamBoxRef}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '1.5rem',
            height: '60vh', overflowY: 'auto',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.82rem', lineHeight: '1.75',
            color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}
        >
          {generatedContent}
          {isStreaming && (
            <span style={{ display: 'inline-block', width: '2px', height: '1em', background: 'var(--amber)', animation: 'cursor-blink 0.8s infinite', verticalAlign: 'text-bottom', marginLeft: '1px' }} />
          )}
        </div>
        <style>{`
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
          @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        `}</style>
      </div>
    )
  }

  // ─── Main form ───
  return (
    <div style={{ padding: '2rem', maxWidth: '680px' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--amber)', marginBottom: '0.25rem' }}>
          회의록 만들기
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          녹음하거나 텍스트 파일을 올리면 Claude가 회의록으로 정리해줍니다
        </p>
      </div>

      {!supported && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: '6px', padding: '0.875rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#ef4444',
        }}>
          이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Safari를 사용해주세요.
        </div>
      )}

      {/* 제목 */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
          회의 제목 (선택 — 비워두면 Claude가 자동 추출)
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="예: 2026-03-18 재경팀 캐시플로 논의"
          disabled={stage === 'recording'}
          style={{
            width: '100%', padding: '0.625rem 0.875rem',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text)', fontSize: '0.875rem', outline: 'none',
          }}
        />
      </div>

      {/* 녹음 + 파일 업로드 */}
      {stage !== 'transcribed' && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => {
            e.preventDefault()
            setIsDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
          style={{
            background: isDragging ? 'rgba(245,158,11,0.08)' : 'var(--bg-card)',
            border: `1px solid ${stage === 'recording' ? 'rgba(239,68,68,0.45)' : isDragging ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`,
            borderRadius: '10px', padding: '1.5rem', textAlign: 'center', marginBottom: '1rem',
            transition: 'all 0.15s',
          }}
        >
          {stage === 'recording' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite', display: 'inline-block' }} />
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
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎙️</div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '0.875rem' }}>
                <button onClick={startRecording} disabled={!supported} style={{
                  padding: '0.625rem 1.5rem',
                  background: supported ? 'var(--amber)' : 'var(--bg-hover)',
                  color: supported ? '#000' : 'var(--text-muted)',
                  border: 'none', borderRadius: '7px', fontWeight: 700,
                  cursor: supported ? 'pointer' : 'not-allowed', fontSize: '0.875rem',
                }}>
                  ⏺ 녹음 시작
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '0.625rem 1.25rem',
                    background: 'var(--bg-hover)', color: 'var(--text)',
                    border: '1px solid var(--border)', borderRadius: '7px',
                    cursor: 'pointer', fontSize: '0.875rem',
                  }}
                >
                  📁 파일 업로드
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleFile(file)
                    e.target.value = ''
                  }}
                />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                녹음: Chrome · Safari · Edge 지원 &nbsp;·&nbsp; 파일: .txt .md (AirDrop 후 파일 앱에서 선택)
              </div>
              {isDragging && (
                <div style={{ marginTop: '0.75rem', color: 'var(--amber)', fontWeight: 600, fontSize: '0.875rem' }}>
                  파일을 여기에 놓으세요
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 전사 텍스트 */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            전사 텍스트 {stage === 'recording' && <span style={{ color: '#ef4444' }}>● 실시간 인식 중</span>}
          </label>
          {stage === 'transcribed' && (
            <button onClick={reset} style={{
              fontSize: '0.75rem', color: 'var(--text-muted)',
              background: 'none', border: 'none', cursor: 'pointer', padding: '0',
            }}>
              ✕ 초기화
            </button>
          )}
        </div>
        <textarea
          value={transcript + (interimText || '')}
          onChange={e => {
            if (stage !== 'recording') {
              setTranscript(e.target.value)
              fullTextRef.current = e.target.value
              if (e.target.value.trim()) setStage('transcribed')
            }
          }}
          placeholder="녹음하거나 파일을 업로드하면 여기에 텍스트가 들어와요. 직접 붙여넣기도 가능합니다."
          readOnly={stage === 'recording'}
          style={{
            width: '100%', height: '180px',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '0.875rem',
            color: 'var(--text)', fontSize: '0.85rem', lineHeight: '1.7',
            resize: 'vertical', outline: 'none', fontFamily: 'inherit',
          }}
        />
        {transcript.trim() && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {transcript.split(/\s+/).filter(Boolean).length.toLocaleString()} 단어
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

      {/* 생성 버튼 */}
      {stage !== 'recording' && (
        <button
          onClick={generate}
          disabled={!transcript.trim()}
          style={{
            width: '100%', padding: '0.75rem',
            background: transcript.trim() ? 'var(--amber)' : 'var(--bg-hover)',
            color: transcript.trim() ? '#000' : 'var(--text-muted)',
            border: 'none', borderRadius: '8px', fontWeight: 700,
            cursor: transcript.trim() ? 'pointer' : 'not-allowed', fontSize: '0.9rem',
          }}
        >
          📝 회의록 생성 →
        </button>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
