'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Stage = 'idle' | 'recording' | 'transcribed' | 'streaming' | 'reviewing' | 'saving' | 'done' | 'error'
type Correction = { from: string; to: string }

// 단어 단위 치환 감지 — 같은 위치에서 바뀐 단어만 추출
function findCorrections(original: string, edited: string): Correction[] {
  const tokenize = (text: string) => text.match(/[가-힣]+|[A-Za-z][A-Za-z0-9]*/g) ?? []
  const orig = tokenize(original)
  const edit = tokenize(edited)
  const seen = new Set<string>()
  const result: Correction[] = []

  const len = Math.min(orig.length, edit.length)
  for (let i = 0; i < len; i++) {
    if (orig[i] !== edit[i] && orig[i].length >= 2 && edit[i].length >= 2) {
      const key = `${orig[i]}→${edit[i]}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ from: orig[i], to: edit[i] })
      }
    }
  }
  return result
}

export default function UploadPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [title, setTitle] = useState('')
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [recordingTime, setRecordingTime] = useState(0)
  const [streamedContent, setStreamedContent] = useState('')   // Claude 원본
  const [editedContent, setEditedContent] = useState('')       // 사람이 수정한 버전
  const [editedTitle, setEditedTitle] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [corrections, setCorrections] = useState<Correction[]>([])
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

  useEffect(() => {
    if (stage === 'streaming' && streamBoxRef.current) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight
    }
  }, [streamedContent, stage])

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
      setError('지원 형식: .txt .md (AirDrop 후 파일 앱에서 선택)')
    }
  }

  const startRecording = () => {
    const SR = getSpeechRecognition()
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'ko-KR'
    recognition.continuous = true
    recognition.interimResults = true
    fullTextRef.current = ''

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        e.results[i].isFinal ? (fullTextRef.current += t + ' ') : (interim += t)
      }
      setTranscript(fullTextRef.current)
      setInterimText(interim)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech') { setError(`음성 인식 오류: ${e.error}`); setStage('error') }
    }
    recognition.onend = () => { if (recognitionRef.current) try { recognition.start() } catch {} }
    recognition.start()
    recognitionRef.current = recognition
    setStage('recording')
    setRecordingTime(0)
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
  }

  const stopRecording = () => {
    if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.stop(); recognitionRef.current = null }
    if (timerRef.current) clearInterval(timerRef.current)
    setInterimText('')
    setStage('transcribed')
  }

  // ─── 스트리밍 생성 ───
  const generate = async () => {
    if (!transcript.trim()) return
    setError('')
    setStreamedContent('')
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
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'meta') { finalTitle = event.title; setEditedTitle(event.title) }
            else if (event.type === 'delta') { finalContent += event.text; setStreamedContent(c => c + event.text) }
            else if (event.type === 'done') { finalContent = event.content; finalWordCount = event.wordCount }
            else if (event.type === 'error') throw new Error(event.message)
          } catch (e) { if (e instanceof SyntaxError) continue; throw e }
        }
      }

      setStreamedContent(finalContent)
      setEditedContent(finalContent)
      setEditedTitle(finalTitle)
      setWordCount(finalWordCount)
      setStage('reviewing')  // ← 스트리밍 끝나면 검수 화면으로
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
      setStage('error')
    }
  }

  // ─── 검수 완료 → 단어장 저장 + 노트 저장 ───
  const approve = async () => {
    setError('')
    const found = findCorrections(streamedContent, editedContent)
    setCorrections(found)
    setStage('saving')

    try {
      // 1. 교정된 단어가 있으면 단어장에 자동 추가
      if (found.length > 0) {
        const vocabRes = await fetch('/api/vocab')
        const { glossary } = await vocabRes.json() as { glossary: string }

        const today = new Date().toISOString().slice(0, 10)
        const newLines = found
          .map(c => `- ${c.from} → ${c.to}`)
          .join('\n')

        // 이미 "## 음성인식 자동교정" 섹션이 있으면 거기에 추가, 없으면 새로 만들기
        const marker = '## 음성인식 자동교정'
        const updated = glossary.includes(marker)
          ? glossary.replace(
              marker,
              `${marker}\n<!-- ${today} -->\n${newLines}`,
            )
          : `${glossary}\n\n${marker}\n<!-- ${today} -->\n${newLines}`

        await fetch('/api/vocab', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'glossary', content: updated }),
        })
      }

      // 2. 회의록 저장
      const saveRes = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedTitle || title.trim() || '회의록',
          content: editedContent,
          transcript,
          word_count: wordCount,
        }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) throw new Error(saveData.error)

      setResult({ id: saveData.id })
      setStage('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 오류')
      setStage('reviewing')
    }
  }

  const reset = () => {
    setStage('idle'); setTitle(''); setTranscript(''); setInterimText('')
    setStreamedContent(''); setEditedContent(''); setEditedTitle('')
    setWordCount(0); setCorrections([]); setResult(null); setError('')
    fullTextRef.current = ''
  }

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  // ════════════════════════════════════════════
  // ─── Done ───
  // ════════════════════════════════════════════
  if (stage === 'done' && result) {
    return (
      <div style={{ padding: '2rem', maxWidth: '720px' }}>
        <div style={{
          background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.35)',
          borderRadius: '12px', padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem' }}>회의록 저장 완료!</div>
          {corrections.length > 0 && (
            <div style={{
              margin: '1rem auto', maxWidth: '380px',
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: '8px', padding: '0.875rem', textAlign: 'left',
            }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--amber)', fontWeight: 600, marginBottom: '0.5rem' }}>
                📚 단어장에 자동 저장된 교정 ({corrections.length}건)
              </div>
              {corrections.map((c, i) => (
                <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.7' }}>
                  <span style={{ color: '#ef9999', textDecoration: 'line-through' }}>{c.from}</span>
                  {' → '}
                  <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{c.to}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
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

  // ════════════════════════════════════════════
  // ─── Streaming ───
  // ════════════════════════════════════════════
  if (stage === 'streaming') {
    return (
      <div style={{ padding: '2rem', maxWidth: '720px' }}>
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%', background: 'var(--amber)',
            animation: 'pulse 1s infinite', display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ fontWeight: 600, color: 'var(--amber)' }}>Claude가 회의록 작성 중...</span>
          {editedTitle && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>— {editedTitle}</span>}
        </div>
        <div ref={streamBoxRef} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '1.5rem',
          height: '65vh', overflowY: 'auto',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.82rem', lineHeight: '1.8', color: 'var(--text)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {streamedContent}
          <span style={{
            display: 'inline-block', width: '2px', height: '1em',
            background: 'var(--amber)', animation: 'blink 0.8s infinite',
            verticalAlign: 'text-bottom', marginLeft: '1px',
          }} />
        </div>
        <style>{`
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        `}</style>
      </div>
    )
  }

  // ════════════════════════════════════════════
  // ─── Reviewing ───
  // ════════════════════════════════════════════
  if (stage === 'reviewing') {
    const wc = editedContent.split(/\s+/).filter(Boolean).length
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1.5rem', maxWidth: '760px' }}>
        {/* 상단 헤더 */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{
              display: 'inline-block', padding: '0.2rem 0.625rem',
              background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)',
              borderRadius: '99px', fontSize: '0.72rem', color: 'var(--amber)', fontWeight: 600, letterSpacing: '0.05em',
            }}>
              검수 중
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              수정하면 단어장에 자동 저장돼요
            </span>
          </div>
          {/* 제목 편집 */}
          <input
            type="text"
            value={editedTitle}
            onChange={e => setEditedTitle(e.target.value)}
            style={{
              width: '100%', fontSize: '1.05rem', fontWeight: 700,
              background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
              color: 'var(--text)', padding: '0.25rem 0', outline: 'none',
            }}
          />
        </div>

        {/* 본문 편집 */}
        <textarea
          value={editedContent}
          onChange={e => setEditedContent(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1, width: '100%', minHeight: '55vh',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '1.25rem',
            color: 'var(--text)', fontSize: '0.85rem',
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: '1.8', resize: 'none', outline: 'none',
            whiteSpace: 'pre-wrap',
          }}
        />

        {/* 오류 */}
        {error && (
          <div style={{
            marginTop: '0.75rem', padding: '0.75rem',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '6px', fontSize: '0.85rem', color: '#ef4444',
          }}>
            {error}
          </div>
        )}

        {/* 하단 액션 바 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {wc.toLocaleString()} 단어
          </div>
          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <button onClick={() => setStage('transcribed')} style={{
              padding: '0.55rem 1.1rem',
              background: 'var(--bg-hover)', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: '6px',
              cursor: 'pointer', fontSize: '0.85rem',
            }}>
              ← 다시 생성
            </button>
            <button onClick={approve} style={{
              padding: '0.55rem 1.4rem',
              background: 'var(--amber)', color: '#000',
              border: 'none', borderRadius: '6px',
              fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem',
            }}>
              ✅ 검수 완료 · 저장
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════
  // ─── Saving ───
  // ════════════════════════════════════════════
  if (stage === 'saving') {
    return (
      <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%', background: 'var(--teal)',
          animation: 'pulse 1s infinite', display: 'inline-block',
        }} />
        <span style={{ color: 'var(--teal)' }}>
          {corrections.length > 0
            ? `단어장에 교정 ${corrections.length}건 저장 중...`
            : '회의록 저장 중...'}
        </span>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>
    )
  }

  // ════════════════════════════════════════════
  // ─── Idle / Recording / Transcribed ───
  // ════════════════════════════════════════════
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

      {/* 녹음 + 파일 업로드 영역 */}
      {stage !== 'transcribed' && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          style={{
            background: isDragging ? 'rgba(245,158,11,0.06)' : 'var(--bg-card)',
            border: `1px solid ${stage === 'recording' ? 'rgba(239,68,68,0.45)' : isDragging ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`,
            borderRadius: '10px', padding: '1.5rem', textAlign: 'center', marginBottom: '1rem', transition: 'all 0.15s',
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
                <button onClick={() => fileInputRef.current?.click()} style={{
                  padding: '0.625rem 1.25rem',
                  background: 'var(--bg-hover)', color: 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: '7px',
                  cursor: 'pointer', fontSize: '0.875rem',
                }}>
                  📁 파일 업로드
                </button>
                <input ref={fileInputRef} type="file" accept=".txt,.md" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                녹음: Chrome · Safari · Edge &nbsp;·&nbsp; 파일: .txt .md (AirDrop 후 파일 앱에서 선택)
              </div>
              {isDragging && <div style={{ marginTop: '0.75rem', color: 'var(--amber)', fontWeight: 600, fontSize: '0.875rem' }}>파일을 여기에 놓으세요</div>}
            </>
          )}
        </div>
      )}

      {/* 전사 텍스트 */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            전사 텍스트{stage === 'recording' && <span style={{ color: '#ef4444' }}> ● 실시간 인식 중</span>}
          </label>
          {stage === 'transcribed' && (
            <button onClick={reset} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
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

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '6px', padding: '0.875rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#ef4444',
        }}>
          {error}
        </div>
      )}

      {stage !== 'recording' && (
        <button onClick={generate} disabled={!transcript.trim()} style={{
          width: '100%', padding: '0.75rem',
          background: transcript.trim() ? 'var(--amber)' : 'var(--bg-hover)',
          color: transcript.trim() ? '#000' : 'var(--text-muted)',
          border: 'none', borderRadius: '8px', fontWeight: 700,
          cursor: transcript.trim() ? 'pointer' : 'not-allowed', fontSize: '0.9rem',
        }}>
          📝 회의록 생성 →
        </button>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
