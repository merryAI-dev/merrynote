'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ──────────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3
type InputMethod = 'mic' | 'file' | 'text'
type Correction = { from: string; to: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function findCorrections(original: string, edited: string): Correction[] {
  const tokenize = (s: string) => s.match(/[가-힣]+|[A-Za-z][A-Za-z0-9]*/g) ?? []
  const orig = tokenize(original)
  const edit = tokenize(edited)
  const seen = new Set<string>()
  const result: Correction[] = []
  const len = Math.min(orig.length, edit.length)
  for (let i = 0; i < len; i++) {
    if (orig[i] !== edit[i] && orig[i].length >= 2 && edit[i].length >= 2) {
      const key = `${orig[i]}→${edit[i]}`
      if (!seen.has(key)) { seen.add(key); result.push({ from: orig[i], to: edit[i] }) }
    }
  }
  return result
}

function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepBar({ step }: { step: WizardStep }) {
  const steps = ['입력', '생성', '검수']
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
      {steps.map((label, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 700, transition: 'all 0.3s',
                background: done ? 'var(--teal)' : active ? 'var(--amber)' : 'var(--bg-hover)',
                color: done || active ? '#000' : 'var(--text-muted)',
                boxShadow: active ? '0 0 0 3px rgba(245,158,11,0.2)' : 'none',
              }}>
                {done ? '✓' : n}
              </div>
              <span style={{ fontSize: '0.72rem', color: active ? 'var(--text)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
            </div>
            {i < 2 && (
              <div style={{
                flex: 1, height: '2px', margin: '0 0.5rem', marginBottom: '1.2rem',
                background: done ? 'var(--teal)' : 'var(--border)', transition: 'background 0.3s',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────
function Spinner({ color = 'var(--amber)' }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block', width: '16px', height: '16px',
      border: `2px solid transparent`, borderTopColor: color, borderRightColor: color,
      borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0,
    }} />
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function UploadPage() {
  const router = useRouter()

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1)
  const [method, setMethod] = useState<InputMethod | null>(null)

  // Input step
  const [title, setTitle] = useState('')
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recTime, setRecTime] = useState(0)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractedFileName, setExtractedFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [micSupported, setMicSupported] = useState(true)

  // Generate step
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamedContent, setStreamedContent] = useState('')
  const [streamedTitle, setStreamedTitle] = useState('')
  const [progressMsg, setProgressMsg] = useState('')   // 청크 처리 진행 메시지
  const [isChunked, setIsChunked] = useState(false)    // 분할 모드 여부

  // Review step
  const [editedContent, setEditedContent] = useState('')
  const [editedTitle, setEditedTitle] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Done
  const [doneId, setDoneId] = useState('')
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [wordCount, setWordCount] = useState(0)

  // Error
  const [error, setError] = useState('')

  // Refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fullTextRef = useRef('')
  const streamBoxRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSR = () => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  useEffect(() => {
    if (!getSR()) setMicSupported(false)
  }, [])

  useEffect(() => {
    if (isStreaming && streamBoxRef.current) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight
    }
  }, [streamedContent, isStreaming])

  // ─── Recording ──────────────────────────────────────────────────────────────
  const startRecording = () => {
    const SR = getSR()
    if (!SR) return
    const rec = new SR()
    rec.lang = 'ko-KR'
    rec.continuous = true
    rec.interimResults = true
    fullTextRef.current = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        e.results[i].isFinal ? (fullTextRef.current += t + ' ') : (interim += t)
      }
      setTranscript(fullTextRef.current)
      setInterimText(interim)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error !== 'no-speech') { setError(`음성 오류: ${e.error}`); stopRecording() }
    }
    rec.onend = () => { if (recognitionRef.current) try { rec.start() } catch {} }
    rec.start()
    recognitionRef.current = rec
    setIsRecording(true)
    setRecTime(0)
    timerRef.current = setInterval(() => setRecTime(t => t + 1), 1000)
  }

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    if (timerRef.current) clearInterval(timerRef.current)
    setIsRecording(false)
    setInterimText('')
  }, [])

  // ─── File extraction ─────────────────────────────────────────────────────────
  const AUDIO_EXTS = ['m4a', 'mp3', 'mp4', 'wav', 'ogg', 'flac', 'webm', 'aac', 'mpeg', 'caf']
  const TEXT_EXTS  = ['txt', 'md', 'docx', 'pdf']

  const extractFile = async (file: File) => {
    setError('')
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

    // ── 텍스트 파일: txt/md → client-side, docx/pdf → /api/extract ──
    if (TEXT_EXTS.includes(ext)) {
      if (ext === 'txt' || ext === 'md') {
        const text = await file.text()
        fullTextRef.current = text
        setTranscript(text)
        setExtractedFileName(file.name)
        return
      }
      setIsExtracting(true)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/extract', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        fullTextRef.current = data.text
        setTranscript(data.text)
        setExtractedFileName(file.name)
      } catch (e) {
        setError(e instanceof Error ? e.message : '파일 추출 실패')
      } finally {
        setIsExtracting(false)
      }
      return
    }

    // ── 오디오 파일: /api/transcribe-audio (Groq Whisper) ──
    if (AUDIO_EXTS.includes(ext)) {
      const sizeMB = file.size / (1024 * 1024)
      if (sizeMB > 25) {
        setError(`파일이 너무 큽니다 (${sizeMB.toFixed(1)}MB / 최대 25MB).\n긴 녹음은 분할하거나 브라우저 녹음을 사용해주세요.`)
        return
      }
      setIsExtracting(true)
      setExtractedFileName(`🎵 ${file.name} (${sizeMB.toFixed(1)}MB) 전사 중...`)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/transcribe-audio', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        fullTextRef.current = data.text
        setTranscript(data.text)
        setExtractedFileName(`✅ ${file.name} (${data.sizeMB}MB 전사 완료)`)
      } catch (e) {
        setError(e instanceof Error ? e.message : '오디오 전사 실패')
        setExtractedFileName('')
      } finally {
        setIsExtracting(false)
      }
      return
    }

    setError('.txt .md .docx .pdf .m4a .mp3 .wav 형식만 지원합니다.')
  }

  // ─── Generate (streaming) ─────────────────────────────────────────────────────
  const generate = async () => {
    if (!transcript.trim()) return
    setError('')
    setStreamedContent('')
    setStreamedTitle('')
    setProgressMsg('')
    setIsChunked(false)
    setStep(2)
    setIsStreaming(true)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, title: title.trim() || undefined }),
      })
      if (!res.ok || !res.body) throw new Error('스트림 연결 실패')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let finalContent = ''
      let finalTitle = ''
      let finalWordCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.type === 'meta') {
              finalTitle = ev.title
              setStreamedTitle(ev.title)
              if (ev.chunked) setIsChunked(true)
            } else if (ev.type === 'progress') {
              setProgressMsg(ev.text)   // 청크 처리 진행 상황
            } else if (ev.type === 'delta') {
              setProgressMsg('')        // 실제 콘텐츠가 오기 시작하면 progress 숨김
              finalContent += ev.text
              setStreamedContent(c => c + ev.text)
            } else if (ev.type === 'done') {
              finalContent = ev.content
              finalWordCount = ev.wordCount
            } else if (ev.type === 'error') {
              throw new Error(ev.message)
            }
          } catch (e) { if (e instanceof SyntaxError) continue; throw e }
        }
      }

      setEditedContent(finalContent)
      setEditedTitle(finalTitle)
      setWordCount(finalWordCount)
      setIsStreaming(false)
      setStep(3)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '생성 오류')
      setIsStreaming(false)
      setStep(1)
    }
  }

  // ─── Approve ─────────────────────────────────────────────────────────────────
  const approve = async () => {
    setError('')
    const found = findCorrections(streamedContent, editedContent)
    setCorrections(found)
    setIsSaving(true)

    try {
      // 교정 단어 → 단어장 자동 저장
      if (found.length > 0) {
        const vRes = await fetch('/api/vocab')
        const { glossary } = await vRes.json() as { glossary: string }
        const today = new Date().toISOString().slice(0, 10)
        const newLines = found.map(c => `- ${c.from} → ${c.to}`).join('\n')
        const marker = '## 음성인식 자동교정'
        const updated = glossary.includes(marker)
          ? glossary.replace(marker, `${marker}\n<!-- ${today} -->\n${newLines}`)
          : `${glossary}\n\n${marker}\n<!-- ${today} -->\n${newLines}`
        await fetch('/api/vocab', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'glossary', content: updated }),
        })
      }

      // 회의록 저장 → Firestore
      const saveRes = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedTitle || title.trim() || '회의록',
          content: editedContent,
          transcript,
          word_count: editedContent.split(/\s+/).filter(Boolean).length,
        }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) throw new Error(saveData.error)

      setDoneId(saveData.id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 오류')
    } finally {
      setIsSaving(false)
    }
  }

  const reset = () => {
    setStep(1); setMethod(null); setTitle(''); setTranscript('')
    setInterimText(''); setIsRecording(false); setRecTime(0)
    setStreamedContent(''); setStreamedTitle(''); setEditedContent(''); setEditedTitle('')
    setDoneId(''); setCorrections([]); setWordCount(0); setError('')
    setExtractedFileName(''); setIsExtracting(false)
    fullTextRef.current = ''
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: Done
  // ════════════════════════════════════════════════════════════════════════════
  if (doneId) {
    return (
      <div style={{ padding: '2rem', maxWidth: '680px' }}>
        <div style={{
          background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.3)',
          borderRadius: '14px', padding: '2.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: '1.15rem', marginBottom: '0.25rem' }}>회의록 저장 완료!</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Firestore에 저장됐어 · {editedContent.split(/\s+/).filter(Boolean).length.toLocaleString()} 단어
          </div>

          {corrections.length > 0 && (
            <div style={{
              margin: '0 auto 1.5rem', maxWidth: '380px',
              background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: '10px', padding: '1rem', textAlign: 'left',
            }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--amber)', fontWeight: 700, marginBottom: '0.5rem' }}>
                📚 단어장 자동 교정 저장 ({corrections.length}건)
              </div>
              {corrections.map((c, i) => (
                <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                  <span style={{ color: '#f87171', textDecoration: 'line-through' }}>{c.from}</span>
                  {' → '}
                  <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{c.to}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button onClick={() => router.push(`/notes/${doneId}`)} style={{
              padding: '0.65rem 1.75rem', background: 'var(--amber)', color: '#000',
              border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer',
            }}>
              회의록 보기 →
            </button>
            <button onClick={() => router.push('/notes')} style={{
              padding: '0.65rem 1.25rem', background: 'var(--bg-hover)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer',
            }}>
              목록 보기
            </button>
            <button onClick={reset} style={{
              padding: '0.65rem 1.25rem', background: 'var(--bg-hover)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer',
            }}>
              새로 시작
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: Step 2 — Streaming
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 2) {
    return (
      <div style={{ padding: '2rem', maxWidth: '760px' }}>
        <StepBar step={2} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: progressMsg ? '0.5rem' : '1rem' }}>
          {isStreaming && <Spinner />}
          <span style={{ fontWeight: 600, color: 'var(--amber)' }}>
            {isStreaming ? 'Claude가 회의록 작성 중...' : '작성 완료 — 검수 화면으로 이동 중'}
          </span>
          {isChunked && !progressMsg && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-hover)', padding: '0.15rem 0.5rem', borderRadius: '99px' }}>
              분할 처리
            </span>
          )}
          {streamedTitle && !progressMsg && (
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
              {streamedTitle}
            </span>
          )}
        </div>
        {/* 청크 처리 진행 메시지 */}
        {progressMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.625rem 0.875rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px' }}>
            <Spinner color="var(--amber)" />
            <span style={{ fontSize: '0.85rem', color: 'var(--amber)' }}>{progressMsg}</span>
          </div>
        )}
        <div ref={streamBoxRef} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '1.5rem',
          height: '65vh', overflowY: 'auto',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.82rem', lineHeight: '1.85', color: 'var(--text)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {streamedContent}
          {isStreaming && (
            <span style={{
              display: 'inline-block', width: '2px', height: '1em',
              background: 'var(--amber)', animation: 'blink 0.8s infinite',
              verticalAlign: 'text-bottom', marginLeft: '1px',
            }} />
          )}
        </div>
        <style>{`
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
          @keyframes spin { to{transform:rotate(360deg)} }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        `}</style>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: Step 3 — Review
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 3) {
    const wc = editedContent.split(/\s+/).filter(Boolean).length
    return (
      <div style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem 2rem', maxWidth: '760px', height: 'calc(100vh - 0px)' }}>
        <StepBar step={3} />

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
          <span style={{
            padding: '0.2rem 0.7rem',
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: '99px', fontSize: '0.72rem', color: 'var(--amber)', fontWeight: 700, letterSpacing: '0.06em',
          }}>
            검수 중
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            수정한 단어는 단어장에 자동 저장돼요
          </span>
        </div>

        {/* 제목 */}
        <input
          type="text" value={editedTitle}
          onChange={e => setEditedTitle(e.target.value)}
          style={{
            width: '100%', fontSize: '1.05rem', fontWeight: 700,
            background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
            color: 'var(--text)', padding: '0.3rem 0', outline: 'none', marginBottom: '0.875rem',
          }}
        />

        {/* 본문 */}
        <textarea
          value={editedContent}
          onChange={e => setEditedContent(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1, width: '100%', minHeight: '50vh',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '1.25rem',
            color: 'var(--text)', fontSize: '0.83rem',
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: '1.85', resize: 'none', outline: 'none',
          }}
        />

        {error && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', fontSize: '0.85rem', color: '#f87171' }}>
            {error}
          </div>
        )}

        {/* 액션 바 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {wc.toLocaleString()} 단어
          </div>
          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <button onClick={() => { setStep(1); setIsStreaming(false) }} style={{
              padding: '0.55rem 1.1rem', background: 'var(--bg-hover)', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
            }}>
              ← 다시 생성
            </button>
            <button onClick={approve} disabled={isSaving} style={{
              padding: '0.55rem 1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: isSaving ? 'var(--bg-hover)' : 'var(--amber)',
              color: isSaving ? 'var(--text-muted)' : '#000',
              border: 'none', borderRadius: '6px', fontWeight: 700,
              cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '0.875rem',
            }}>
              {isSaving && <Spinner color="#888" />}
              {isSaving ? '저장 중...' : '✅ 검수 완료 · 저장'}
            </button>
          </div>
        </div>
        <style>{`@keyframes spin { to{transform:rotate(360deg)} }`}</style>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: Step 1 — Input
  // ════════════════════════════════════════════════════════════════════════════
  const inputMethods = [
    { id: 'mic' as InputMethod, icon: '🎙️', label: '음성 녹음', desc: 'Chrome · Safari · Edge', disabled: !micSupported },
    { id: 'file' as InputMethod, icon: '📄', label: '파일 업로드', desc: '.m4a .mp3 .docx .pdf 등', disabled: false },
    { id: 'text' as InputMethod, icon: '✍️', label: '텍스트 입력', desc: '직접 붙여넣기', disabled: false },
  ]

  return (
    <div style={{ padding: '2rem', maxWidth: '680px' }}>
      <StepBar step={1} />

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--amber)', marginBottom: '0.25rem' }}>
          회의록 만들기
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          입력 방식을 고르고 Claude한테 넘기면 자동으로 회의록이 만들어져요
        </p>
      </div>

      {/* ── 입력 방식 선택 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {inputMethods.map(m => (
          <button
            key={m.id}
            onClick={() => !m.disabled && setMethod(method === m.id ? null : m.id)}
            disabled={m.disabled}
            style={{
              padding: '1rem 0.75rem', textAlign: 'center',
              background: method === m.id ? 'rgba(245,158,11,0.1)' : 'var(--bg-card)',
              border: `1px solid ${method === m.id ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`,
              borderRadius: '10px', cursor: m.disabled ? 'not-allowed' : 'pointer',
              opacity: m.disabled ? 0.4 : 1, transition: 'all 0.15s', color: 'inherit',
            }}
          >
            <div style={{ fontSize: '1.5rem', marginBottom: '0.375rem' }}>{m.icon}</div>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem', color: method === m.id ? 'var(--amber)' : 'var(--text)' }}>
              {m.label}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.desc}</div>
          </button>
        ))}
      </div>

      {/* ── 방식별 UI ── */}
      {method === 'mic' && (
        <div style={{
          background: 'var(--bg-card)', border: `1px solid ${isRecording ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
          borderRadius: '10px', padding: '1.5rem', textAlign: 'center', marginBottom: '1rem', transition: 'border-color 0.2s',
        }}>
          {isRecording ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite', display: 'inline-block' }} />
                <span style={{ fontWeight: 600, color: '#ef4444' }}>녹음 중</span>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{formatTime(recTime)}</span>
              </div>
              <button onClick={stopRecording} style={{
                padding: '0.7rem 2rem', background: '#ef4444', color: '#fff',
                border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer',
              }}>
                ⏹ 녹음 중지
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>🎙️</div>
              <button onClick={startRecording} style={{
                padding: '0.7rem 2rem', background: 'var(--amber)', color: '#000',
                border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer',
              }}>
                ⏺ 녹음 시작
              </button>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                한국어 자동 인식 — 말하는 내용이 아래 텍스트로 바로 표시돼요
              </div>
            </>
          )}
        </div>
      )}

      {method === 'file' && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => {
            e.preventDefault(); setIsDragging(false)
            const f = e.dataTransfer.files[0]
            if (f) extractFile(f)
          }}
          onClick={() => !isExtracting && fileInputRef.current?.click()}
          style={{
            background: isDragging ? 'rgba(245,158,11,0.06)' : 'var(--bg-card)',
            border: `1px dashed ${isDragging ? 'rgba(245,158,11,0.6)' : 'var(--border)'}`,
            borderRadius: '10px', padding: '2rem', textAlign: 'center', marginBottom: '1rem',
            cursor: isExtracting ? 'default' : 'pointer', transition: 'all 0.15s',
          }}
        >
          {isExtracting ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
              <Spinner />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>파일 추출 중...</span>
            </div>
          ) : extractedFileName ? (
            <div>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✅</div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', color: 'var(--teal)' }}>{extractedFileName}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>다른 파일을 클릭해서 교체</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '2rem', marginBottom: '0.625rem' }}>📄</div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                {isDragging ? '여기에 놓으세요' : '클릭하거나 파일을 드래그하세요'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
                {['.m4a','.mp3','.wav','.ogg','.flac'].map(e => (
                  <span key={e} style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'rgba(20,184,166,0.12)', color: 'var(--teal)', borderRadius: '4px' }}>{e}</span>
                ))}
                {['.txt','.md','.docx','.pdf'].map(e => (
                  <span key={e} style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'rgba(245,158,11,0.1)', color: 'var(--amber)', borderRadius: '4px' }}>{e}</span>
                ))}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                🎵 오디오: Groq Whisper 전사 (최대 25MB) · ⚠️ GROQ_API_KEY 필요
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                📱 iPhone AirDrop → 파일 앱 → 공유 → Safari에서 선택 &nbsp;|&nbsp; 🤖 갤럭시: 녹음 앱 → 공유
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.docx,.pdf,.m4a,.mp3,.mp4,.wav,.ogg,.flac,.webm,.aac,.caf,audio/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain,text/markdown"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) extractFile(f); e.target.value = '' }}
          />
        </div>
      )}

      {method === 'text' && (
        <div style={{ marginBottom: '1rem' }}>
          <textarea
            autoFocus
            value={transcript}
            onChange={e => { setTranscript(e.target.value); fullTextRef.current = e.target.value }}
            placeholder="전사 텍스트나 회의 메모를 붙여넣으세요"
            style={{
              width: '100%', height: '160px',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '0.875rem',
              color: 'var(--text)', fontSize: '0.875rem', lineHeight: '1.7',
              resize: 'vertical', outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>
      )}

      {/* ── 전사 텍스트 미리보기 ── */}
      {(transcript || interimText) && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              전사 텍스트{isRecording && <span style={{ color: '#ef4444' }}> ● 인식 중</span>}
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {(transcript + interimText).split(/\s+/).filter(Boolean).length.toLocaleString()} 단어
              </span>
              <button onClick={() => { setTranscript(''); fullTextRef.current = ''; setExtractedFileName('') }}
                style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                초기화
              </button>
            </div>
          </div>
          {method !== 'text' && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '0.875rem',
              fontSize: '0.82rem', lineHeight: '1.7', color: 'var(--text)',
              maxHeight: '120px', overflowY: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {transcript}
              {interimText && <span style={{ color: 'var(--text-muted)' }}>{interimText}</span>}
            </div>
          )}
        </div>
      )}

      {/* ── 회의 제목 ── */}
      {(method || transcript) && (
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
            회의 제목 (선택 — 비워두면 Claude가 자동 추출)
          </label>
          <input
            type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="예: 재경팀 캐시플로 DX 논의"
            style={{
              width: '100%', padding: '0.625rem 0.875rem',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '6px', color: 'var(--text)', fontSize: '0.875rem', outline: 'none',
            }}
          />
        </div>
      )}

      {/* ── 오류 ── */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '6px', padding: '0.875rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#f87171',
        }}>
          {error}
        </div>
      )}

      {/* ── 생성 버튼 ── */}
      <button
        onClick={generate}
        disabled={!transcript.trim() || isExtracting || isRecording}
        style={{
          width: '100%', padding: '0.8rem',
          background: transcript.trim() && !isExtracting && !isRecording ? 'var(--amber)' : 'var(--bg-hover)',
          color: transcript.trim() && !isExtracting && !isRecording ? '#000' : 'var(--text-muted)',
          border: 'none', borderRadius: '8px', fontWeight: 700,
          cursor: transcript.trim() && !isExtracting && !isRecording ? 'pointer' : 'not-allowed',
          fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
        }}
      >
        {isExtracting ? <><Spinner color="#888" /> 파일 추출 중...</> : '📝 회의록 생성 →'}
      </button>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
