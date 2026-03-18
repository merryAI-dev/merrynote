'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function NoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [note, setNote] = useState<{ title: string; content: string; created_at: string; word_count: number | null; duration_min: number | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [html, setHtml] = useState('')

  useEffect(() => {
    fetch(`/api/notes/${id}`)
      .then(r => r.json())
      .then(data => { setNote(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!note) return
    // dynamic import marked to avoid SSR issues
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
    a.href = url
    a.download = `${note.title}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>불러오는 중...</div>
  if (!note) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>회의록을 찾을 수 없습니다.</div>

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div style={{ padding: '2rem', maxWidth: '780px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <button
            onClick={() => router.back()}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: '0.8rem', padding: '0', marginBottom: '0.75rem',
            }}
          >
            ← 목록
          </button>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {formatDate(note.created_at)}
            {note.word_count ? ` · ${note.word_count.toLocaleString()} 단어` : ''}
            {note.duration_min ? ` · ${note.duration_min}분` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleDownload}
            style={{
              padding: '0.375rem 0.875rem', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: '5px',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem',
            }}
          >
            ↓ 다운로드
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '0.375rem 0.875rem', background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: '5px',
              color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem',
            }}
          >
            삭제
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="prose-note"
        style={{ lineHeight: '1.7' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
