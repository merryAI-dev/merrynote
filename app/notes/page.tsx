'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Note = {
  id: string
  title: string
  word_count: number | null
  created_at: string
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; title: string; excerpt: string; created_at: string }[] | null>(null)
  const [searching, setSearching] = useState(false)

  const loadNotes = () => {
    setLoading(true)
    setError(false)
    fetch('/api/notes')
      .then(r => r.json())
      .then(data => { setNotes(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }

  useEffect(() => { loadNotes() }, [])

  const search = async () => {
    if (query.trim().length < 2) return
    setSearching(true)
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    const data = await res.json()
    setSearchResults(Array.isArray(data) ? data : [])
    setSearching(false)
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  const displayNotes = searchResults ?? notes

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--amber)', marginBottom: '0.25rem' }}>
          회의록
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          {notes.length > 0 ? `총 ${notes.length}개` : ''}
        </p>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setSearchResults(null) }}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="회의록 검색..."
          style={{
            flex: 1, padding: '0.625rem 0.875rem',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text)', fontSize: '0.875rem', outline: 'none',
          }}
        />
        <button
          onClick={search}
          disabled={searching}
          style={{
            padding: '0.625rem 1rem', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: '6px',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem',
          }}
        >
          {searching ? '...' : '검색'}
        </button>
        {searchResults && (
          <button
            onClick={() => { setSearchResults(null); setQuery('') }}
            style={{
              padding: '0.625rem 0.75rem', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Note list */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>불러오는 중...</div>
      ) : error ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            회의록을 불러오지 못했어요.
          </div>
          <button
            onClick={loadNotes}
            style={{
              padding: '0.5rem 1.25rem', background: 'var(--amber)',
              color: '#000', border: 'none', borderRadius: '6px',
              fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      ) : displayNotes.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '3rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📂</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {searchResults ? '검색 결과가 없습니다.' : '회의록이 없습니다. 음성 파일을 업로드해보세요!'}
          </div>
          {!searchResults && (
            <Link
              href="/upload"
              style={{
                display: 'inline-block', marginTop: '1rem',
                padding: '0.5rem 1.25rem', background: 'var(--amber)',
                color: '#000', borderRadius: '6px', textDecoration: 'none',
                fontSize: '0.8rem', fontWeight: 700,
              }}
            >
              + 첫 회의록 만들기
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {displayNotes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              style={{
                display: 'block', padding: '1rem 1.25rem',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '8px', textDecoration: 'none',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {note.title}
                  </div>
                  {'excerpt' in note && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '0.25rem' }}>
                      {(note as { excerpt?: string }).excerpt}
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {formatDate(note.created_at)}
                    {"word_count" in note && note.word_count ? ` · ${note.word_count.toLocaleString()} 단어` : ""}
                  </div>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '1rem', flexShrink: 0 }}>→</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
