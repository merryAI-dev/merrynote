'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { marked } from 'marked'

type Source = { id: string; title: string; score: number; date: string }
type Message = {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  streaming?: boolean
}

const SUGGESTED = [
  '최근 회의에서 결정된 사항을 요약해줘',
  '액션 아이템 목록을 알려줘',
  '재경팀 관련 논의 내용이 있어?',
  '미결 사항이 뭐가 있어?',
]

function SourceChips({ sources }: { sources: Source[] }) {
  if (!sources.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.625rem' }}>
      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', alignSelf: 'center' }}>📄</span>
      {sources.map(s => (
        <Link
          key={s.id}
          href={`/notes/${s.id}`}
          style={{
            fontSize: '0.7rem', padding: '0.2rem 0.55rem',
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: '99px', color: 'var(--amber)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
          }}
        >
          {s.title.length > 28 ? s.title.slice(0, 28) + '…' : s.title}
          <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>{Math.round(s.score * 100)}%</span>
        </Link>
      ))}
    </div>
  )
}

function MsgBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  const html = !isUser ? marked.parse(msg.content) as string : null

  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      gap: '0.625rem',
      alignItems: 'flex-start',
      marginBottom: '1.25rem',
    }}>
      {/* 아바타 */}
      <div style={{
        width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
        background: isUser ? 'var(--amber)' : 'var(--bg-hover)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.8rem', fontWeight: 700,
        color: isUser ? '#000' : 'var(--text-muted)',
      }}>
        {isUser ? '나' : 'M'}
      </div>

      {/* 버블 */}
      <div style={{ maxWidth: '78%' }}>
        <div style={{
          padding: '0.75rem 1rem',
          background: isUser ? 'rgba(245,158,11,0.12)' : 'var(--bg-card)',
          border: `1px solid ${isUser ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
          borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
          fontSize: '0.875rem', lineHeight: '1.7', color: 'var(--text)',
        }}>
          {isUser ? (
            <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
          ) : html ? (
            <>
              <div
                className="prose-note"
                dangerouslySetInnerHTML={{ __html: html }}
                style={{ fontSize: '0.875rem' }}
              />
              {msg.streaming && (
                <span style={{
                  display: 'inline-block', width: '2px', height: '1em',
                  background: 'var(--amber)', animation: 'blink 0.8s infinite',
                  verticalAlign: 'text-bottom', marginLeft: '1px',
                }} />
              )}
            </>
          ) : null}
        </div>
        {/* 소스 */}
        {msg.sources && <SourceChips sources={msg.sources} />}
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '안녕하세요! 저는 MerryNote 챗봇이에요 🙂\n회의록에 대해 무엇이든 물어보세요. 임베딩 검색으로 관련 내용을 찾아 답변해드릴게요.',
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || isLoading) return

    setInput('')
    const userMsg: Message = { role: 'user', content }
    const history = [...messages, userMsg]
    setMessages(history)
    setIsLoading(true)

    // 스트리밍 자리 확보
    const assistantIdx = history.length
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history
            .filter(m => !m.streaming)
            .map(m => ({ role: m.role, content: m.content })),
        }),
      })
      if (!res.ok || !res.body) throw new Error('연결 실패')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let sources: Source[] = []
      let content = ''

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
            if (ev.type === 'sources') {
              sources = ev.sources
              setMessages(prev => {
                const next = [...prev]
                next[assistantIdx] = { ...next[assistantIdx], sources }
                return next
              })
            } else if (ev.type === 'delta') {
              content += ev.text
              setMessages(prev => {
                const next = [...prev]
                next[assistantIdx] = { ...next[assistantIdx], content, streaming: true }
                return next
              })
            } else if (ev.type === 'done') {
              setMessages(prev => {
                const next = [...prev]
                next[assistantIdx] = { ...next[assistantIdx], content, streaming: false, sources }
                return next
              })
            } else if (ev.type === 'error') {
              throw new Error(ev.message)
            }
          } catch (e) { if (e instanceof SyntaxError) continue; throw e }
        }
      }
    } catch (e) {
      setMessages(prev => {
        const next = [...prev]
        next[assistantIdx] = {
          role: 'assistant',
          content: `오류가 발생했어요: ${e instanceof Error ? e.message : '알 수 없는 오류'}`,
          streaming: false,
        }
        return next
      })
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '760px', margin: '0 auto' }}>

      {/* ── 헤더 ── */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0,
      }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'var(--amber)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '1rem',
        }}>M</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Merry 챗봇</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            회의록 기반 RAG · 임베딩 검색
          </div>
        </div>
        <Link href="/notes" style={{
          marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)',
          textDecoration: 'none', padding: '0.3rem 0.75rem',
          border: '1px solid var(--border)', borderRadius: '6px',
        }}>
          회의록 목록
        </Link>
      </div>

      {/* ── 메시지 ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {messages.map((msg, i) => <MsgBubble key={i} msg={msg} />)}

        {/* 추천 질문 (첫 메시지 후, 입력 없을 때) */}
        {messages.length === 1 && !isLoading && (
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.625rem' }}>
              이런 걸 물어볼 수 있어요
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {SUGGESTED.map(q => (
                <button key={q} onClick={() => send(q)} style={{
                  padding: '0.45rem 0.875rem',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '99px', fontSize: '0.8rem', color: 'var(--text-muted)',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── 입력창 ── */}
      <div style={{
        padding: '1rem 1.5rem',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', gap: '0.625rem', alignItems: 'flex-end',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '0.625rem 0.75rem',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="회의록에 대해 물어보세요... (Enter 전송, Shift+Enter 줄바꿈)"
            disabled={isLoading}
            rows={1}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: '0.875rem', lineHeight: '1.5',
              resize: 'none', maxHeight: '120px', overflowY: 'auto',
              fontFamily: 'inherit',
            }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || isLoading}
            style={{
              width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
              background: input.trim() && !isLoading ? 'var(--amber)' : 'var(--bg-hover)',
              color: input.trim() && !isLoading ? '#000' : 'var(--text-muted)',
              border: 'none', cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', transition: 'all 0.15s',
            }}
          >
            {isLoading ? (
              <span style={{
                width: '14px', height: '14px', border: '2px solid transparent',
                borderTopColor: 'var(--text-muted)', borderRightColor: 'var(--text-muted)',
                borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'block',
              }} />
            ) : '↑'}
          </button>
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.375rem', textAlign: 'center' }}>
          회의록에 저장된 내용만 참고해요 · 소스 노트를 클릭하면 원문을 볼 수 있어요
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
