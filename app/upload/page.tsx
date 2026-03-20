'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'


// ─── Types ──────────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | 4
type InputMethod = 'mic' | 'file' | 'text'
type Correction = { from: string; to: string }
type SpeakerMapping = { quote: string; speaker: string }

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

// 전사 결과에서 [MM:SS Speaker N] 패턴 파싱
type Segment = { start: number; end: number; speaker: string; text: string }
function parseSegments(text: string): Segment[] {
  const pat = /^\[(\d{1,2}):(\d{2})\s+(Speaker\s*\d+|화자\s*\d+)\]\s*(.+)/i
  const segs: Segment[] = []
  for (const line of text.split('\n')) {
    const m = line.trim().match(pat)
    if (m) segs.push({ start: +m[1]*60 + +m[2], end: 0, speaker: m[3].replace(/\s+/g,' ').trim(), text: m[4].trim() })
  }
  for (let i = 0; i < segs.length; i++) segs[i].end = i < segs.length-1 ? segs[i+1].start : segs[i].start+30
  return segs
}

// 트랜스크립트에서 대표 발언 샘플 추출
function extractSampleQuotes(transcript: string, n = 6): string[] {
  const sentences = transcript
    .split(/\n+|(?<=[.!?。])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 180)
  if (sentences.length === 0) return []
  if (sentences.length <= n) return sentences
  const step = Math.floor(sentences.length / n)
  return Array.from({ length: n }, (_, i) => sentences[Math.min(i * step, sentences.length - 1)])
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepBar({ step }: { step: WizardStep }) {
  const steps = ['입력', '참석자', '생성', '검수']
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
      {steps.map((label, i) => {
        const n = (i + 1) as WizardStep
        const active = n === step
        const done = n < step
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : 'none' }}>
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
            {i < 3 && (
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
  const [pendingCorrections, setPendingCorrections] = useState<{ correction: Correction; checked: boolean }[]>([])

  // Done
  const [doneId, setDoneId] = useState('')
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [wordCount, setWordCount] = useState(0)

  // 이전 회의 화자 이름 제안
  const [suggestedNames, setSuggestedNames] = useState<string[]>([])

  // Error
  const [error, setError] = useState('')

  // 라이브 트랜스크립트 라인 (녹음 중 실시간 표시용)
  const [liveLines, setLiveLines] = useState<string[]>([])

  // MediaRecorder — Gemini 재전사 (Phase 3)
  const [showRetranscribeChoice, setShowRetranscribeChoice] = useState(false)
  const [retranscribing, setRetranscribing] = useState(false)

  // 비동기 모드 (Kafka + Qwen)
  const [asyncMode, setAsyncMode] = useState(false)
  const [jobId, setJobId] = useState('')
  const [jobStatus, setJobStatus] = useState('')
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 발화자 매핑 (Step 2)
  const [speakerMappings, setSpeakerMappings] = useState<SpeakerMapping[]>([])

  // Refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fullTextRef = useRef('')
  const liveLinesRef = useRef<string[]>([])
  const streamBoxRef = useRef<HTMLDivElement>(null)
  const liveBoxRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSR = () => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  useEffect(() => {
    if (!getSR()) setMicSupported(false)
  }, [])

  // Step 2 진입 시 이전 회의 화자 이름 로드
  useEffect(() => {
    if (step === 2 && suggestedNames.length === 0) {
      fetch('/api/notes').then(r => r.json()).then((notes: { speakerMap?: Record<string, string> }[]) => {
        const names = new Map<string, number>()
        for (const n of notes.slice(0, 10)) {
          if (n.speakerMap) {
            for (const name of Object.values(n.speakerMap)) {
              names.set(name, (names.get(name) ?? 0) + 1)
            }
          }
        }
        const sorted = [...names.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
        if (sorted.length > 0) setSuggestedNames(sorted)
      }).catch(() => {})
    }
  }, [step, suggestedNames.length])

  // 폴링 cleanup
  useEffect(() => {
    return () => { if (jobPollRef.current) clearInterval(jobPollRef.current) }
  }, [])

  useEffect(() => {
    if (isStreaming && streamBoxRef.current) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight
    }
  }, [streamedContent, isStreaming])

  useEffect(() => {
    if (liveBoxRef.current) {
      liveBoxRef.current.scrollTop = liveBoxRef.current.scrollHeight
    }
  }, [liveLines, interimText])

  // ─── Recording ──────────────────────────────────────────────────────────────
  const startRecording = async () => {
    const SR = getSR()
    if (!SR) return
    const rec = new SR()
    rec.lang = 'ko-KR'
    rec.continuous = true
    rec.interimResults = true
    fullTextRef.current = ''
    liveLinesRef.current = []
    recordedChunksRef.current = []
    setLiveLines([])
    setShowRetranscribeChoice(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          fullTextRef.current += t + ' '
          // 마침표·물음표·느낌표 기준으로 라인 분리, 없으면 그냥 추가
          const sentences = t.trim().match(/[^.!?。]+[.!?。]*/g) ?? [t.trim()]
          sentences.forEach((s: string) => {
            const line = s.trim()
            if (line) {
              liveLinesRef.current = [...liveLinesRef.current, line]
              setLiveLines([...liveLinesRef.current])
            }
          })
        } else {
          interim += t
        }
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

    // MediaRecorder로 오디오도 동시에 녹음 (Gemini 재전사용)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      const mr = new MediaRecorder(stream, { mimeType })
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      mr.onstop = () => stream.getTracks().forEach(t => t.stop())
      mr.start(1000)
      mediaRecorderRef.current = mr
    } catch { /* MediaRecorder 실패해도 Web Speech는 계속 동작 */ }
  }

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    mediaRecorderRef.current = null
    setIsRecording(false)
    setInterimText('')
    // 녹음된 오디오가 있으면 재전사 선택 UI 표시
    setTimeout(() => {
      if (recordedChunksRef.current.length > 0 && fullTextRef.current.trim()) {
        setShowRetranscribeChoice(true)
      }
    }, 500)
  }, [])

  const retranscribeWithGemini = async () => {
    if (!recordedChunksRef.current.length) return
    setRetranscribing(true)
    setShowRetranscribeChoice(false)
    setError('')
    try {
      const mimeType = recordedChunksRef.current[0].type || 'audio/webm'
      const blob = new Blob(recordedChunksRef.current, { type: mimeType })
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm'
      const file = new File([blob], `live-${Date.now()}.${ext}`, { type: mimeType })
      const sizeMB = file.size / (1024 * 1024)
      let text: string
      if (sizeMB > 4.3) {
        const blobResult = await upload(`${Date.now()}-${file.name}`, file, { access: 'public', handleUploadUrl: '/api/blob-upload' })
        const res = await fetch('/api/transcribe-audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: blobResult.url, filename: file.name }) })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '재전사 실패')
        text = data.text
      } else {
        const fd = new FormData(); fd.append('file', file)
        const res = await fetch('/api/transcribe-audio', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '재전사 실패')
        text = data.text
      }
      fullTextRef.current = text
      setTranscript(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gemini 재전사 실패')
    } finally {
      setRetranscribing(false)
    }
  }

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
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          let msg = text
          try { msg = JSON.parse(text).error ?? text } catch {}
          throw new Error(msg || `서버 오류 (${res.status})`)
        }
        const data = await res.json()
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

    // ── 오디오 파일: /api/transcribe-audio (Gemini) ──
    if (AUDIO_EXTS.includes(ext)) {
      const sizeMB = file.size / (1024 * 1024)
      const useBlobUpload = sizeMB > 4.3  // 4.3MB 초과 시 Vercel Blob 직접 업로드

      setIsExtracting(true)
      setExtractedFileName(`🎵 ${file.name} (${sizeMB.toFixed(1)}MB) ${useBlobUpload ? '대용량 업로드 중...' : '전사 중...'}`)
      try {
        let audioUrl: string | null = null

        if (useBlobUpload) {
          // ── 대용량: 브라우저 → Vercel Blob 직접 업로드 ──
          setExtractedFileName(`☁️ ${file.name} (${sizeMB.toFixed(1)}MB) Blob에 업로드 중...`)
          const uniqueName = `${Date.now()}-${file.name}`
          const blob = await upload(uniqueName, file, {
            access: 'public',
            handleUploadUrl: '/api/blob-upload',
          })
          audioUrl = blob.url
          setExtractedFileName(`🔄 ${file.name} 전사 중... (Gemini AI)`)

          // Blob URL을 API에 전달해서 전사
          const res = await fetch('/api/transcribe-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: audioUrl, filename: file.name }),
          })
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            let msg = text
            try { msg = JSON.parse(text).error ?? text } catch {}
            throw new Error(msg || `서버 오류 (${res.status})`)
          }
          const data = await res.json()
          fullTextRef.current = data.text
          setTranscript(data.text)
          setExtractedFileName(`✅ ${file.name} (${data.sizeMB}MB 전사 완료)`)
        } else {
          // ── 소용량: FormData 직접 업로드 ──
          const fd = new FormData()
          fd.append('file', file)
          const res = await fetch('/api/transcribe-audio', { method: 'POST', body: fd })
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            let msg = text
            try { msg = JSON.parse(text).error ?? text } catch {}
            throw new Error(msg || `서버 오류 (${res.status})`)
          }
          const data = await res.json()
          fullTextRef.current = data.text
          setTranscript(data.text)
          setExtractedFileName(`✅ ${file.name} (${data.sizeMB}MB 전사 완료)`)
        }
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
  const generate = async (mappings: SpeakerMapping[] = speakerMappings) => {
    if (!transcript.trim()) return
    setError('')
    setStreamedContent('')
    setStreamedTitle('')
    setProgressMsg('')
    setIsChunked(false)
    setStep(3)
    setIsStreaming(true)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          title: title.trim() || undefined,
          speakerMappings: mappings.filter(m => m.speaker.trim()),
        }),
      })
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        let msg = text
        try { msg = JSON.parse(text).error ?? text } catch {}
        throw new Error(msg || `스트림 연결 실패 (${res.status})`)
      }

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
      setStep(4)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '생성 오류')
      setIsStreaming(false)
      setStep(1)
    }
  }

  // ─── Generate Async (Kafka + Qwen) ──────────────────────────────────────────
  const generateAsync = async (mappings: SpeakerMapping[] = speakerMappings) => {
    if (!transcript.trim()) return
    setError('')
    setAsyncMode(true)
    setJobStatus('queued')
    setStep(3)

    try {
      const res = await fetch('/api/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          title: title.trim() || undefined,
          speakerMappings: mappings.filter(m => m.speaker.trim()),
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let msg = text
        try { msg = JSON.parse(text).error ?? text } catch {}
        throw new Error(msg || `비동기 생성 실패 (${res.status})`)
      }

      const { jobId: jid } = await res.json()
      setJobId(jid)

      // 폴링 시작
      jobPollRef.current = setInterval(async () => {
        try {
          const jr = await fetch(`/api/jobs/${jid}`)
          const job = await jr.json()
          setJobStatus(job.status)

          if (job.status === 'done' && job.noteId) {
            if (jobPollRef.current) clearInterval(jobPollRef.current)
            router.push(`/notes/${job.noteId}`)
          } else if (job.status === 'error') {
            if (jobPollRef.current) clearInterval(jobPollRef.current)
            setError(job.error ?? '회의록 생성 실패')
            setStep(1)
            setAsyncMode(false)
          }
        } catch { /* 폴링 실패는 무시, 다음 시도 */ }
      }, 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '비동기 생성 오류')
      setStep(1)
      setAsyncMode(false)
    }
  }

  // ─── Approve ─────────────────────────────────────────────────────────────────
  // 1단계: 저장 버튼 클릭 → 교정 목록 계산 → 확인 패널 표시
  const requestApprove = () => {
    const found = findCorrections(streamedContent, editedContent)
    if (found.length > 0) {
      setPendingCorrections(found.map(c => ({ correction: c, checked: true })))
    } else {
      setPendingCorrections([])
      void approve([])
    }
  }

  // 2단계: 확인된 교정만 저장
  const approve = async (checkedCorrections: Correction[]) => {
    setError('')
    setCorrections(checkedCorrections)
    setIsSaving(true)

    try {
      // 선택된 교정 단어만 단어장에 저장
      if (checkedCorrections.length > 0) {
        const vRes = await fetch('/api/vocab')
        const { glossary } = await vRes.json() as { glossary: string }
        const today = new Date().toISOString().slice(0, 10)
        const newLines = checkedCorrections.map(c => `- ${c.from} → ${c.to}`).join('\n')
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

      // 화자 세그먼트 파싱 + 매핑 구축
      const segments = parseSegments(transcript)
      const sMap: Record<string, string> = {}
      for (const m of speakerMappings) {
        if (!m.speaker.trim()) continue
        const seg = segments.find(s => s.text.includes(m.quote.slice(0, 30)))
        if (seg && !sMap[seg.speaker]) sMap[seg.speaker] = m.speaker.trim()
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
          speaker_map: Object.keys(sMap).length > 0 ? sMap : null,
          speaker_segments: segments.length > 0 ? segments : null,
        }),
      })
      if (!saveRes.ok) {
        const text = await saveRes.text().catch(() => '')
        let msg = text
        try { msg = JSON.parse(text).error ?? text } catch {}
        throw new Error(msg || `저장 실패 (${saveRes.status})`)
      }
      const saveData = await saveRes.json()

      setDoneId(saveData.id)
      setPendingCorrections([])
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
    setDoneId(''); setCorrections([]); setWordCount(0); setError(''); setPendingCorrections([])
    setExtractedFileName(''); setIsExtracting(false); setLiveLines([]); setSpeakerMappings([])
    fullTextRef.current = ''; liveLinesRef.current = []
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
  // RENDER: Step 2 — 발화자 매핑
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 2) {
    const quotes = extractSampleQuotes(transcript)
    // 처음 진입 시 speakerMappings 초기화
    if (speakerMappings.length === 0 && quotes.length > 0) {
      setSpeakerMappings(quotes.map(q => ({ quote: q, speaker: '' })))
    }
    const knownNames = Array.from(new Set([
      ...suggestedNames,
      ...speakerMappings.map(m => m.speaker).filter(Boolean),
    ]))

    return (
      <div style={{ padding: '2rem', maxWidth: '680px' }}>
        <StepBar step={2} />

        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--amber)', marginBottom: '0.25rem' }}>
            참석자를 알아볼게요
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            아래 발언들이 누구의 말인지 알려주시면 회의록에 이름이 정확하게 표기돼요.<br />
            모르는 발언은 비워도 괜찮아요.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.5rem' }}>
          {(speakerMappings.length > 0 ? speakerMappings : quotes.map(q => ({ quote: q, speaker: '' }))).map((item, i) => (
            <div key={i} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '1rem 1.125rem',
            }}>
              {/* 발언 */}
              <div style={{
                fontSize: '0.875rem', lineHeight: '1.7', color: 'var(--text)',
                marginBottom: '0.75rem',
                borderLeft: '3px solid var(--amber)', paddingLeft: '0.75rem',
              }}>
                &ldquo;{item.quote}&rdquo;
              </div>
              {/* 이름 입력 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>발화자</span>
                <input
                  type="text"
                  value={item.speaker}
                  onChange={e => setSpeakerMappings(prev =>
                    prev.map((m, j) => j === i ? { ...m, speaker: e.target.value } : m)
                  )}
                  placeholder="이름 입력 (예: 보람, 에이블, 남지)"
                  list={`names-${i}`}
                  style={{
                    flex: 1, padding: '0.4rem 0.75rem',
                    background: 'var(--bg-hover)', border: '1px solid var(--border)',
                    borderRadius: '6px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none',
                  }}
                />
                {knownNames.length > 0 && (
                  <datalist id={`names-${i}`}>
                    {knownNames.map(n => <option key={n} value={n} />)}
                  </datalist>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <button onClick={() => setStep(1)} style={{
            padding: '0.6rem 1.1rem', background: 'var(--bg-hover)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem',
          }}>
            ← 뒤로
          </button>
          <button onClick={() => generate(speakerMappings)} style={{
            flex: 1, padding: '0.6rem', background: 'var(--amber)', color: '#000',
            border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem',
          }}>
            📝 회의록 생성 →
          </button>
          <button onClick={() => generateAsync(speakerMappings)} style={{
            padding: '0.6rem 1rem', background: 'rgba(124,58,237,0.15)',
            border: '1px solid rgba(124,58,237,0.4)', borderRadius: '6px',
            color: '#7C3AED', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
          }}>
            ⚡ Qwen 비동기
          </button>
          <button onClick={() => generate([])} style={{
            padding: '0.6rem 1rem', background: 'var(--bg-hover)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem',
          }}>
            건너뛰기
          </button>
        </div>
        <style>{`@keyframes spin { to{transform:rotate(360deg)} }`}</style>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: Step 3 — Streaming / Async
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 3 && asyncMode) {
    const statusLabels: Record<string, { label: string; color: string; icon: string }> = {
      queued: { label: '대기열에 추가됨', color: 'var(--text-muted)', icon: '📋' },
      processing: { label: 'Qwen이 회의록 작성 중...', color: '#7C3AED', icon: '⚡' },
      done: { label: '완료! 이동 중...', color: 'var(--teal)', icon: '✅' },
      error: { label: '생성 실패', color: '#EF4444', icon: '❌' },
    }
    const st = statusLabels[jobStatus] ?? statusLabels.queued
    return (
      <div style={{ padding: '2rem', maxWidth: '680px' }}>
        <StepBar step={3} />
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '3rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{st.icon}</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: st.color, marginBottom: '0.5rem' }}>
            {st.label}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Kafka → Qwen Worker 파이프라인으로 비동기 처리 중
          </div>

          {/* 프로그레스 바 */}
          <div style={{ height: 6, background: '#333', borderRadius: 3, overflow: 'hidden', marginBottom: '1rem' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: jobStatus === 'processing' ? '#7C3AED' : jobStatus === 'done' ? 'var(--teal)' : 'var(--text-muted)',
              width: jobStatus === 'queued' ? '15%' : jobStatus === 'processing' ? '60%' : '100%',
              transition: 'width 0.5s ease',
            }} />
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Job ID: {jobId.slice(0, 8)}... · 3초마다 상태 확인 중
          </div>

          {jobStatus !== 'done' && (
            <button onClick={() => {
              if (jobPollRef.current) clearInterval(jobPollRef.current)
              setAsyncMode(false)
              setStep(1)
            }} style={{
              marginTop: '1.5rem', padding: '0.5rem 1.25rem',
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem',
            }}>
              취소
            </button>
          )}
        </div>
        <style>{`@keyframes spin { to{transform:rotate(360deg)} }`}</style>
      </div>
    )
  }

  if (step === 3) {
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
  // RENDER: Step 4 — Review
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 4) {
    const wc = editedContent.split(/\s+/).filter(Boolean).length
    return (
      <div style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem 2rem', maxWidth: '760px', height: 'calc(100vh - 0px)' }}>
        <StepBar step={4} />

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

        {/* 교정 확인 패널 */}
        {pendingCorrections.length > 0 && !isSaving && (
          <div style={{
            marginTop: '1rem', padding: '0.875rem 1rem',
            background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: '8px',
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--amber)', marginBottom: '0.625rem' }}>
              📝 단어장에 추가할 교정 항목을 선택해주세요
            </div>
            {pendingCorrections.map((item, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => setPendingCorrections(prev => prev.map((p, j) => j === i ? { ...p, checked: !p.checked } : p))}
                  style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }}
                />
                <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>{item.correction.from}</span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{item.correction.to}</span>
              </label>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                onClick={() => approve(pendingCorrections.filter(p => p.checked).map(p => p.correction))}
                style={{
                  padding: '0.45rem 1rem', background: 'var(--amber)', color: '#000',
                  border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem',
                }}
              >
                선택 항목 저장하기
              </button>
              <button
                onClick={() => approve([])}
                style={{
                  padding: '0.45rem 0.875rem', background: 'var(--bg-hover)', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem',
                }}
              >
                교정 없이 저장
              </button>
            </div>
          </div>
        )}

        {/* 액션 바 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {wc.toLocaleString()} 단어
          </div>
          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <button onClick={() => { setStep(2); setIsStreaming(false) }} style={{
              padding: '0.55rem 1.1rem', background: 'var(--bg-hover)', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
            }}>
              ← 다시 생성
            </button>
            <button onClick={requestApprove} disabled={isSaving || pendingCorrections.length > 0} style={{
              padding: '0.55rem 1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: isSaving || pendingCorrections.length > 0 ? 'var(--bg-hover)' : 'var(--amber)',
              color: isSaving || pendingCorrections.length > 0 ? 'var(--text-muted)' : '#000',
              border: 'none', borderRadius: '6px', fontWeight: 700,
              cursor: isSaving || pendingCorrections.length > 0 ? 'not-allowed' : 'pointer', fontSize: '0.875rem',
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
      {method === 'mic' && !isRecording && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '1.5rem', textAlign: 'center', marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>🎙️</div>
          <button onClick={startRecording} style={{
            padding: '0.7rem 2rem', background: 'var(--amber)', color: '#000',
            border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer',
          }}>
            ⏺ 녹음 시작
          </button>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
            한국어 자동 인식 — 말하는 내용이 실시간으로 스트리밍돼요
          </div>
        </div>
      )}

      {/* ── 라이브 트랜스크립트 뷰 (녹음 중) ── */}
      {method === 'mic' && isRecording && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: '12px', overflow: 'hidden', marginBottom: '1rem',
          boxShadow: '0 0 0 3px rgba(239,68,68,0.07)',
        }}>
          {/* 헤더 바 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
            background: 'rgba(239,68,68,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: '#ef4444', display: 'inline-block',
                animation: 'pulse 1s infinite',
              }} />
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ef4444' }}>LIVE</span>
              <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {formatTime(recTime)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {(transcript + interimText).split(/\s+/).filter(Boolean).length} 단어
              </span>
              <button onClick={stopRecording} style={{
                padding: '0.4rem 1rem', background: '#ef4444', color: '#fff',
                border: 'none', borderRadius: '6px', fontWeight: 700,
                cursor: 'pointer', fontSize: '0.8rem',
              }}>
                ⏹ 중지
              </button>
            </div>
          </div>

          {/* 트랜스크립트 스트림 */}
          <div
            ref={liveBoxRef}
            style={{
              height: '320px', overflowY: 'auto',
              padding: '1.25rem 1.5rem',
              display: 'flex', flexDirection: 'column', gap: '0.5rem',
            }}
          >
            {liveLines.length === 0 && !interimText && (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic',
              }}>
                말씀해주세요...
              </div>
            )}
            {liveLines.map((line, i) => (
              <div key={i} style={{
                fontSize: '0.95rem', lineHeight: '1.75', color: 'var(--text)',
                padding: '0.375rem 0',
                borderBottom: i < liveLines.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                animation: 'fadeIn 0.3s ease',
              }}>
                {line}
              </div>
            ))}
            {/* 인식 중인 텍스트 */}
            {interimText && (
              <div style={{
                fontSize: '0.95rem', lineHeight: '1.75',
                color: 'var(--text-muted)', fontStyle: 'italic',
                padding: '0.375rem 0',
              }}>
                {interimText}
                <span style={{
                  display: 'inline-block', width: '2px', height: '1em',
                  background: 'var(--amber)', marginLeft: '2px',
                  animation: 'blink 0.8s infinite', verticalAlign: 'text-bottom',
                }} />
              </div>
            )}
            {!interimText && liveLines.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', paddingTop: '0.25rem' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--amber)', animation: 'pulse 1.2s infinite', display: 'inline-block' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>듣는 중...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Gemini 재전사 선택 (녹음 완료 후) ── */}
      {method === 'mic' && showRetranscribeChoice && !isRecording && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem',
        }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
            🎙️ 녹음이 완료됐어요. 어떤 전사본을 사용할까요?
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowRetranscribeChoice(false)}
              style={{
                flex: 1, padding: '0.75rem', background: 'var(--bg-hover)',
                border: '1px solid var(--border)', borderRadius: '8px',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Web Speech 결과 사용</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>실시간 인식된 텍스트 · 즉시 진행</div>
            </button>
            <button
              onClick={retranscribeWithGemini}
              disabled={retranscribing}
              style={{
                flex: 1, padding: '0.75rem', background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.4)', borderRadius: '8px',
                cursor: retranscribing ? 'not-allowed' : 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--amber)' }}>
                {retranscribing && <Spinner />}
                Gemini AI 재전사
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {retranscribing ? '전사 중...' : '녹음 오디오를 Gemini로 재전사 · 더 정확'}
              </div>
            </button>
          </div>
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
                🎵 오디오: Gemini AI 전사 · 4.3MB 이하 직접 · 초과 시 Blob 자동 업로드 (최대 100MB)
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

      {/* ── 다음 버튼 (발화자 매핑으로 이동) ── */}
      <button
        onClick={() => { setSpeakerMappings([]); setStep(2) }}
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
        {isExtracting ? <><Spinner color="#888" /> 파일 추출 중...</> : '다음 → 참석자 확인'}
      </button>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}
