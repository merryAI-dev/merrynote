'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const SpeakerWaveform = dynamic(() => import('@/components/SpeakerWaveform'), { ssr: false })

type Segment = { start: number; end: number; speaker: string; text: string }
type Structured = { decisions: string[]; actions: { owner: string; task: string }[]; agenda: string[] }
type Note = {
  title: string; content: string
  created_at: string; createdAt?: string
  word_count: number | null; wordCount?: number | null
  duration_min: number | null; durationMin?: number | null
  audioUrl?: string | null
  structured?: Structured | null
  speakerMap?: Record<string, string> | null
  speakerSegments?: Segment[] | null
}

export default function NoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [note, setNote] = useState<Note | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [html, setHtml] = useState('')

  const [copied, setCopied] = useState(false)
  const [slackSharing, setSlackSharing] = useState(false)
  const [slackDone, setSlackDone] = useState(false)

  // 편집 모드
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/notes/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { setNote(data); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [id])

  useEffect(() => {
    if (!note) return
    import('marked').then(({ marked }) => {
      const result = marked(note.content)
      if (typeof result === 'string') setHtml(result)
      else result.then(setHtml)
    })
  }, [note])

  const handleDelete = async () => {
    if (!confirm('이 회의록을 삭제할까요?')) return
    setDeleting(true)
    await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    router.push('/notes')
  }

  const handleDownload = () => {
    if (!note) return
    const blob = new Blob([note.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${note.title}.md`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleSlack = async () => {
    if (!note) return
    const channel = prompt('공유할 채널명을 입력하세요 (예: general)')
    if (!channel) return
    setSlackSharing(true)
    try {
      const res = await fetch('/api/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          title: note.title,
          summary: note.structured?.decisions?.slice(0, 2).join(' / ') ?? '',
          url: window.location.href,
        }),
      })
      if (!res.ok) throw new Error()
      setSlackDone(true)
      setTimeout(() => setSlackDone(false), 3000)
    } catch {
      alert('Slack 전송에 실패했어요.')
    } finally {
      setSlackSharing(false)
    }
  }

  const handleCopy = async () => {
    if (!note) return
    await navigator.clipboard.writeText(note.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const startEdit = () => {
    if (!note) return
    setEditTitle(note.title)
    setEditContent(note.content)
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const handleSave = async () => {
    if (!editTitle.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim(), content: editContent }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setNote(prev => prev ? { ...prev, title: updated.title, content: updated.content } : prev)
      setEditing(false)
    } catch {
      alert('저장에 실패했어요. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>불러오는 중...</div>

  if (error || !note) return (
    <div style={{ padding: '2rem', maxWidth: '780px' }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '8px', padding: '3rem', textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
        <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          {error ? '회의록을 불러오지 못했어요.' : '존재하지 않는 회의록입니다.'}
        </div>
        <Link href="/notes" style={{
          display: 'inline-block', padding: '0.5rem 1.25rem',
          background: 'var(--amber)', color: '#000', borderRadius: '6px',
          textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700,
        }}>
          목록으로 돌아가기
        </Link>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '2rem', maxWidth: '780px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: 0, marginBottom: '0.75rem' }}
          >
            ← 목록
          </button>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {formatDate(note.created_at ?? note.createdAt ?? '')}
            {(note.word_count ?? note.wordCount) ? ` · ${(note.word_count ?? note.wordCount)!.toLocaleString()} 단어` : ''}
            {(note.duration_min ?? note.durationMin) ? ` · ${note.duration_min ?? note.durationMin}분` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!editing && (
            <button onClick={startEdit} style={{
              padding: '0.375rem 0.875rem', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: '5px',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem',
            }}>
              ✏️ 수정
            </button>
          )}
          <button onClick={handleSlack} disabled={slackSharing} style={{
            padding: '0.375rem 0.875rem', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: '5px',
            color: slackDone ? 'var(--teal)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem',
          }}>
            {slackDone ? '✓ 전송됨' : slackSharing ? '...' : 'Slack'}
          </button>
          <button onClick={handleCopy} style={{
            padding: '0.375rem 0.875rem', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: '5px',
            color: copied ? 'var(--teal)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem',
          }}>
            {copied ? '✓ 복사됨' : '복사'}
          </button>
          <button onClick={handleDownload} style={{
            padding: '0.375rem 0.875rem', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: '5px',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem',
          }}>
            ↓ MD
          </button>
          <button onClick={() => window.print()} style={{
            padding: '0.375rem 0.875rem', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: '5px',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem',
          }}>
            🖨️ 인쇄
          </button>
          <button onClick={handleDelete} disabled={deleting} style={{
            padding: '0.375rem 0.875rem', background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: '5px',
            color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem',
          }}>
            삭제
          </button>
        </div>
      </div>

      {/* 편집 모드 */}
      {editing ? (
        <div>
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            style={{
              width: '100%', fontSize: '1.25rem', fontWeight: 700,
              background: 'none', border: 'none', borderBottom: '2px solid var(--amber)',
              color: 'var(--text)', outline: 'none', padding: '0.25rem 0',
              marginBottom: '1rem', boxSizing: 'border-box',
            }}
          />
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            style={{
              width: '100%', minHeight: '60vh', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text)', fontSize: '0.875rem', lineHeight: '1.7',
              padding: '1rem', outline: 'none', resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
            <button onClick={cancelEdit} style={{
              padding: '0.5rem 1.25rem', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem',
            }}>
              취소
            </button>
            <button onClick={handleSave} disabled={saving || !editTitle.trim()} style={{
              padding: '0.5rem 1.25rem', background: 'var(--amber)',
              border: 'none', borderRadius: '6px',
              color: '#000', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem', fontWeight: 700,
            }}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.5rem', lineHeight: '1.4' }}>
            {note.title}
          </h1>

          {/* 오디오 플레이어 + 화자별 파형 */}
          {note.audioUrl && (
            <SpeakerWaveform
              audioUrl={note.audioUrl}
              segments={note.speakerSegments ?? undefined}
              speakerMap={note.speakerMap ?? undefined}
              noteId={id}
              onSpeakerMapUpdate={(map) => setNote(prev => prev ? { ...prev, speakerMap: map } : prev)}
            />
          )}

          {/* 구조화 카드 (Phase 4) */}
          {note.structured && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.75rem' }}>
              {note.structured.agenda?.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>논의 주제</div>
                  <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.82rem', lineHeight: '1.7' }}>
                    {note.structured.agenda.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
              {note.structured.decisions?.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>결정 사항</div>
                  <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.82rem', lineHeight: '1.7' }}>
                    {note.structured.decisions.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
              {note.structured.actions?.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>액션 아이템</div>
                  <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.82rem', lineHeight: '1.7' }}>
                    {note.structured.actions.map((a, i) => (
                      <li key={i}><strong>{a.owner}</strong>: {a.task}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="prose-note" style={{ lineHeight: '1.7' }} dangerouslySetInnerHTML={{ __html: html }} />
        </>
      )}
    </div>
  )
}
