import Link from 'next/link'

export default function DashboardPage() {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--amber)', marginBottom: '0.25rem' }}>
          대시보드
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{today}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: '전체 회의록', value: '—', unit: '', icon: '◇' },
          { label: '이번 달', value: '—', unit: '', icon: '◈' },
          { label: '누적 단어', value: '—', unit: '', icon: '◎' },
        ].map(({ label, value, unit, icon }) => (
          <div
            key={label}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '1.25rem',
            }}
          >
            <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem', opacity: 0.6 }}>{icon}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--amber)' }}>
              {value}<span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>{unit}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
        <Link href="/upload" style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '1.25rem', textDecoration: 'none',
        }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '8px',
            background: 'rgba(245,158,11,0.1)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0,
          }}>🎙️</div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>음성 업로드</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>m4a, mp3, wav 등 지원</div>
          </div>
        </Link>

        <Link href="/notes" style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '1.25rem', textDecoration: 'none',
        }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '8px',
            background: 'rgba(20,184,166,0.1)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0,
          }}>📋</div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>회의록 보기</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>검색 및 열람</div>
          </div>
        </Link>
      </div>

      <div style={{
        background: 'rgba(245,158,11,0.05)',
        border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: '8px', padding: '1.25rem',
      }}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--amber)' }}>
          💡 시작하는 방법
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.75', margin: 0 }}>
          <strong style={{ color: 'var(--text)' }}>업로드</strong>를 눌러 녹음을 시작하거나 전사 텍스트를 붙여넣으세요.
          Claude가 자동으로 회의록을 작성해드립니다.
        </p>
      </div>
    </div>
  )
}
