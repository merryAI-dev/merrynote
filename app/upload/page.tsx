'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type Stage = 'idle' | 'uploading' | 'transcribing' | 'generating' | 'saving' | 'done' | 'error'

export default function UploadPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState<{ id: string; filename: string } | null>(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleFile = useCallback((f: File) => {
    setFile(f)
    setError('')
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '))
  }, [title])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      mr.ondataavailable = (e) => chunksRef.current.push(e.data)
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const f = new File([blob], `녹음-${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')}.webm`, { type: 'audio/webm' })
        handleFile(f)
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } catch {
      setError('마이크 접근 권한이 필요합니다.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    if (timerRef.current) clearInterval(timerRef.current)
    setIsRecording(false)
  }

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  const process = async () => {
    if (!file) return
    setError('')

    try {
      // 1. 전사
      setStage('transcribing')
      const fd = new FormData()
      fd.append('audio', file)
      const transRes = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const transData = await transRes.json()
      if (!transRes.ok) throw new Error(transData.error)
      setTranscript(transData.transcript)

      // 2. 회의록 생성
      setStage('generating')
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transData.transcript, title: title.trim() || undefined }),
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.error)

      // 3. 저장
      setStage('saving')
      const saveRes = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: genData.title,
          content: genData.content,
          transcript: transData.transcript,
          word_count: genData.wordCount,
        }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) throw new Error(saveData.error)

      setResult({ id: saveData.id, filename: genData.filename })
      setStage('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.')
      setStage('error')
    }
  }

  const stageLabels: Record<Stage, string> = {
    idle: '',
    uploading: '업로드 중...',
    transcribing: '🎙️ 음성 전사 중... (1~3분 소요)',
    generating: '📝 Claude 회의록 생성 중...',
    saving: '💾 저장 중...',
    done: '✅ 완료!',
    error: '❌ 오류',
  }

  const busy = ['uploading', 'transcribing', 'generating', 'saving'].includes(stage)

  return (
    <div style={{ padding: '2rem', maxWidth: '680px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--amber)', marginBottom: '0.25rem' }}>
          음성 업로드
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          오디오 파일을 올리거나 직접 녹음하면 회의록으로 자동 변환됩니다
        </p>
      </div>

      {stage === 'done' && result ? (
        <div style={{
          background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.3)',
          borderRadius: '8px', padding: '1.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✅</div>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>회의록이 생성되었습니다!</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>{result.filename}</div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={() => router.push(`/notes/${result.id}`)}
              style={{
                padding: '0.5rem 1.25rem', background: 'var(--amber)', color: '#000',
                borderRadius: '6px', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem',
              }}
            >
              회의록 보기 →
            </button>
            <button
              onClick={() => { setStage('idle'); setFile(null); setTitle(''); setTranscript(''); setResult(null) }}
              style={{
                padding: '0.5rem 1.25rem', background: 'var(--bg-hover)', color: 'var(--text)',
                borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.875rem',
              }}
            >
              새로 업로드
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => !file && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--amber)' : file ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: '10px',
              padding: '2rem',
              textAlign: 'center',
              cursor: file ? 'default' : 'pointer',
              background: dragOver ? 'rgba(245,158,11,0.05)' : 'var(--bg-card)',
              transition: 'all 0.2s',
              marginBottom: '1rem',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".m4a,.mp3,.wav,.aiff,.aac,.mp4,.mov,.webm"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {file ? (
              <div>
                <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>🎵</div>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{file.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  style={{
                    marginTop: '0.75rem', padding: '0.25rem 0.75rem', background: 'transparent',
                    border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-muted)',
                    fontSize: '0.75rem', cursor: 'pointer',
                  }}
                >
                  파일 변경
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📂</div>
                <div style={{ fontWeight: 600, marginBottom: '0.375rem' }}>파일을 드래그하거나 클릭하여 선택</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  m4a, mp3, wav, aiff, aac, mp4, mov 지원
                </div>
              </div>
            )}
          </div>

          {/* 브라우저 녹음 */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '1rem', marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '1rem',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>브라우저 직접 녹음</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {isRecording ? `녹음 중... ${formatTime(recordingTime)}` : 'iPhone Safari에서도 사용 가능'}
              </div>
            </div>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              style={{
                padding: '0.5rem 1rem',
                background: isRecording ? '#ef4444' : 'rgba(245,158,11,0.1)',
                color: isRecording ? '#fff' : 'var(--amber)',
                border: `1px solid ${isRecording ? '#ef4444' : 'rgba(245,158,11,0.3)'}`,
                borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
              }}
            >
              {isRecording ? '⏹ 중지' : '⏺ 녹음 시작'}
            </button>
          </div>

          {/* Title input */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
              회의 제목 (선택)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="입력하지 않으면 내용에서 자동 추출"
              style={{
                width: '100%', padding: '0.625rem 0.875rem',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '6px', color: 'var(--text)', fontSize: '0.875rem', outline: 'none',
              }}
            />
          </div>

          {/* Progress */}
          {busy && (
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '6px', padding: '0.875rem', marginBottom: '1rem',
              fontSize: '0.875rem', color: 'var(--amber)',
            }}>
              <span style={{ marginRight: '0.5rem' }}>⟳</span>
              {stageLabels[stage]}
            </div>
          )}

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '6px', padding: '0.875rem', marginBottom: '1rem',
              fontSize: '0.875rem', color: '#ef4444',
            }}>
              {error}
            </div>
          )}

          <button
            onClick={process}
            disabled={!file || busy}
            style={{
              width: '100%', padding: '0.75rem',
              background: !file || busy ? 'var(--bg-hover)' : 'var(--amber)',
              color: !file || busy ? 'var(--text-muted)' : '#000',
              border: 'none', borderRadius: '8px', fontWeight: 700,
              cursor: !file || busy ? 'not-allowed' : 'pointer', fontSize: '0.9rem',
              transition: 'all 0.15s',
            }}
          >
            {busy ? stageLabels[stage] : '전사 + 회의록 생성 →'}
          </button>
        </>
      )}

      {/* Transcript preview */}
      {transcript && stage !== 'idle' && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>전사 결과 미리보기</div>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '0.875rem', fontSize: '0.8rem',
            color: 'var(--text-muted)', maxHeight: '180px', overflowY: 'auto',
            lineHeight: '1.6', whiteSpace: 'pre-wrap',
          }}>
            {transcript.slice(0, 600)}{transcript.length > 600 ? '...' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
