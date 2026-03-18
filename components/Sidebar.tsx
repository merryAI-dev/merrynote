'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const navItems = [
  { href: '/', label: '대시보드', icon: '◈' },
  { href: '/notes', label: '회의록', icon: '◇' },
  { href: '/upload', label: '업로드', icon: '△' },
  { href: '/chat', label: '챗봇', icon: '◉' },
  { href: '/vocab', label: '단어장', icon: '◎' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // 라우트 변경 시 모바일 메뉴 닫기
  useEffect(() => { setOpen(false) }, [pathname])

  const navContent = (
    <>
      {/* Logo */}
      <div style={{ padding: '0 1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🎙️</span>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--amber)' }}>MerryNote</span>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          MYSC 회의록 by Claude
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 0.75rem' }}>
        {navItems.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                padding: '0.625rem 0.75rem', borderRadius: '6px', marginBottom: '0.25rem',
                background: active ? 'var(--bg-hover)' : 'transparent',
                color: active ? 'var(--amber)' : 'var(--text-muted)',
                fontSize: '0.875rem', fontWeight: active ? 600 : 400,
                textDecoration: 'none', transition: 'all 0.15s',
                borderLeft: active ? '2px solid var(--amber)' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '0 1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        <Link href="/upload" style={{
          display: 'block', width: '100%', padding: '0.625rem',
          background: 'var(--amber)', color: '#000', borderRadius: '6px',
          textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none',
        }}>
          + 새 회의록
        </Link>
      </div>
    </>
  )

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="sidebar-desktop" style={{
        width: '220px', minWidth: '220px',
        background: 'var(--bg-card)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: '1.5rem 0',
      }}>
        {navContent}
      </aside>

      {/* 모바일 헤더 */}
      <header className="sidebar-mobile-header" style={{
        display: 'none', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        height: '52px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
        alignItems: 'center', padding: '0 1rem', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>🎙️</span>
          <span style={{ fontWeight: 700, color: 'var(--amber)', fontSize: '1rem' }}>MerryNote</span>
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            background: 'none', border: 'none', color: 'var(--text)',
            cursor: 'pointer', fontSize: '1.25rem', padding: '0.25rem',
          }}
          aria-label="메뉴"
        >
          {open ? '✕' : '☰'}
        </button>
      </header>

      {/* 모바일 오버레이 메뉴 */}
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              display: 'none', position: 'fixed', inset: 0, zIndex: 40,
              background: 'rgba(0,0,0,0.5)',
            }}
            className="sidebar-mobile-overlay"
          />
          <aside
            className="sidebar-mobile-drawer"
            style={{
              display: 'none', position: 'fixed', top: '52px', left: 0, bottom: 0, zIndex: 45,
              width: '240px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)',
              flexDirection: 'column', padding: '1.5rem 0',
            }}
          >
            {navContent}
          </aside>
        </>
      )}

      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .sidebar-mobile-header { display: flex !important; }
          .sidebar-mobile-overlay { display: block !important; }
          .sidebar-mobile-drawer { display: flex !important; }
        }
      `}</style>
    </>
  )
}
