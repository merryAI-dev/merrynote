'use client'

import { useState, useEffect } from 'react'

export default function VocabPage() {
  const [glossary, setGlossary] = useState('')
  const [names, setNames] = useState('')
  const [active, setActive] = useState<'glossary' | 'names'>('glossary')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vocab')
      .then(r => r.json())
      .then(data => { setGlossary(data.glossary || ''); setNames(data.names || ''); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    await fetch('/api/vocab', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: active, content: active === 'glossary' ? glossary : names }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const tabs = [
    { key: 'glossary', label: '용어집', desc: 'MYSC 조직/사업 용어 (411개)' },
    { key: 'names', label: '멤버 명단', desc: '실명 ↔ 별명 매핑 (82명)' },
  ]

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--amber)', marginBottom: '0.25rem' }}>
          단어장
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          전사 오류 수정과 회의록 생성에 사용되는 MYSC 고유 용어 목록입니다
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {tabs.map(({ key, label, desc }) => (
          <button
            key={key}
            onClick={() => setActive(key as 'glossary' | 'names')}
            style={{
              padding: '0.5rem 1rem',
              background: active === key ? 'var(--bg-hover)' : 'var(--bg-card)',
              border: `1px solid ${active === key ? 'var(--amber)' : 'var(--border)'}`,
              borderRadius: '6px',
              color: active === key ? 'var(--amber)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: '0.875rem',
              textAlign: 'left',
            }}
          >
            <div style={{ fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{desc}</div>
          </button>
        ))}
      </div>

      {/* Editor */}
      <div style={{ position: 'relative' }}>
        <textarea
          value={active === 'glossary' ? glossary : names}
          onChange={(e) => active === 'glossary' ? setGlossary(e.target.value) : setNames(e.target.value)}
          disabled={loading}
          style={{
            width: '100%', height: '520px',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '1rem',
            color: 'var(--text)', fontSize: '0.8rem',
            fontFamily: 'JetBrains Mono, monospace', lineHeight: '1.6',
            resize: 'vertical', outline: 'none',
          }}
          placeholder={loading ? '불러오는 중...' : '내용을 입력하세요'}
        />
        <div style={{
          position: 'absolute', bottom: '1rem', right: '1rem',
          display: 'flex', gap: '0.5rem', alignItems: 'center',
        }}>
          {saved && (
            <span style={{ color: 'var(--teal)', fontSize: '0.75rem' }}>✓ 저장됨</span>
          )}
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '0.375rem 1rem',
              background: saving ? 'var(--bg-hover)' : 'var(--amber)',
              color: saving ? 'var(--text-muted)' : '#000',
              border: 'none', borderRadius: '5px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem', fontWeight: 700,
            }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        * 저장한 내용은 다음 회의록 생성부터 반영됩니다
      </div>
    </div>
  )
}
