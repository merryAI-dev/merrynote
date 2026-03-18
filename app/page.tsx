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
        <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'var(--amber)' }}>
          ⚙️ 초기 설정 체크리스트
        </div>
        <ol style={{ fontSize: '0.875rem', color: 'var(--text-muted)', paddingLeft: '1.25rem', lineHeight: '1.9' }}>
          <li>AXR팀과 OpenAI Whisper API + Anthropic API 사용 협의</li>
          <li>Supabase 프로젝트 생성 → <code style={{ background: 'var(--bg-hover)', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.8rem' }}>.env.local</code> 설정</li>
          <li>Supabase에 notes, vocab 테이블 생성</li>
          <li>API 키 확보 후 환경변수 추가</li>
        </ol>
      </div>
    </div>
  )
}
