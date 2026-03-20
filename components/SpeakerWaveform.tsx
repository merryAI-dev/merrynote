'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

type Segment = { start: number; end: number; speaker: string; text: string }

type Props = {
  audioUrl: string
  segments?: Segment[]
  speakerMap?: Record<string, string>
  noteId?: string
  onSpeakerMapUpdate?: (map: Record<string, string>) => void
}

const COLORS = [
  '#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16',
]

export default function SpeakerWaveform({ audioUrl, segments, speakerMap, noteId, onSpeakerMapUpdate }: Props) {
  const waveRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [editingMap, setEditingMap] = useState<Record<string, string>>(speakerMap ?? {})
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null)
  const [savingMap, setSavingMap] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  // 화자별 고유 목록 & 색상
  const speakers = Array.from(new Set((segments ?? []).map(s => s.speaker)))
  const colorMap: Record<string, string> = {}
  speakers.forEach((s, i) => { colorMap[s] = COLORS[i % COLORS.length] })

  const getName = useCallback((speaker: string) => editingMap[speaker] ?? speakerMap?.[speaker] ?? speaker, [editingMap, speakerMap])

  const saveSpeakerMap = async (newMap: Record<string, string>) => {
    if (!noteId) return
    setSavingMap(true)
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakerMap: newMap }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSavedMsg(`저장 완료 (교정 ${data.corrections ?? 0}건 적립)`)
      setTimeout(() => setSavedMsg(''), 3000)
      onSpeakerMapUpdate?.(newMap)
    } catch {
      setSavedMsg('저장 실패')
      setTimeout(() => setSavedMsg(''), 3000)
    } finally {
      setSavingMap(false)
      setEditingSpeaker(null)
    }
  }

  // 화자별 통계
  const speakerStats = speakers.map(s => {
    const segs = (segments ?? []).filter(seg => seg.speaker === s)
    const totalSec = segs.reduce((acc, seg) => acc + (seg.end - seg.start), 0)
    // 대표 10초 구간: 가장 긴 세그먼트 찾기
    const longest = segs.reduce((best, seg) =>
      (seg.end - seg.start) > (best.end - best.start) ? seg : best
    , segs[0])
    return { speaker: s, name: getName(s), totalSec, segs, longest, color: colorMap[s] }
  })

  useEffect(() => {
    if (!waveRef.current) return
    let ws: ReturnType<typeof import('wavesurfer.js')['default']['create']> | null = null

    import('wavesurfer.js').then(({ default: WaveSurfer }) => {
      ws = WaveSurfer.create({
        container: waveRef.current!,
        waveColor: '#444',
        progressColor: '#F59E0B',
        cursorColor: '#F59E0B',
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 80,
        normalize: true,
        url: audioUrl,
      })

      ws.on('ready', () => {
        setReady(true)
        setDuration(ws!.getDuration())

        // 화자별 구간 색상 오버레이 (regions 대신 CSS로 처리)
      })

      ws.on('timeupdate', (t: number) => setCurrentTime(t))
      ws.on('play', () => setPlaying(true))
      ws.on('pause', () => setPlaying(false))
      ws.on('finish', () => setPlaying(false))

      wsRef.current = ws
    })

    return () => { ws?.destroy() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl])

  const play10s = (startSec: number) => {
    if (!wsRef.current || !ready) return
    const ws = wsRef.current
    ws.setTime(startSec)
    ws.play()
    setTimeout(() => { if (wsRef.current) wsRef.current.pause() }, 10000)
  }

  const togglePlay = () => {
    if (!wsRef.current) return
    wsRef.current.playPause()
  }

  const seekTo = (sec: number) => {
    if (!wsRef.current) return
    wsRef.current.setTime(sec)
  }

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // 현재 재생 중인 화자 찾기
  const currentSpeaker = (segments ?? []).find(s => currentTime >= s.start && currentTime < s.end)

  return (
    <div style={{ marginBottom: '1.75rem' }}>
      {/* 파형 + 재생 컨트롤 */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '1rem', marginBottom: '0.75rem',
      }}>
        {/* 현재 화자 표시 */}
        {currentSpeaker && (
          <div style={{
            fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem',
            color: colorMap[currentSpeaker.speaker] ?? 'var(--text-muted)',
          }}>
            🎙️ {getName(currentSpeaker.speaker)}
          </div>
        )}

        {/* 파형 */}
        <div ref={waveRef} style={{ width: '100%', minHeight: 80 }} />

        {/* 화자 구간 타임라인 바 */}
        {segments && segments.length > 0 && duration > 0 && (
          <div style={{
            height: 8, borderRadius: 4, overflow: 'hidden', marginTop: '0.5rem',
            display: 'flex', background: '#333',
          }}>
            {segments.map((seg, i) => (
              <div
                key={i}
                onClick={() => seekTo(seg.start)}
                title={`${getName(seg.speaker)} ${fmt(seg.start)}`}
                style={{
                  width: `${((seg.end - seg.start) / duration) * 100}%`,
                  background: colorMap[seg.speaker] ?? '#666',
                  cursor: 'pointer',
                  marginLeft: i === 0 ? `${(seg.start / duration) * 100}%` : 0,
                  opacity: 0.7,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
              />
            ))}
          </div>
        )}

        {/* 컨트롤 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '0.75rem',
        }}>
          <button onClick={togglePlay} disabled={!ready} style={{
            padding: '0.35rem 1rem', background: 'var(--amber)',
            border: 'none', borderRadius: '6px', color: '#000',
            fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed',
            fontSize: '0.8rem', opacity: ready ? 1 : 0.5,
          }}>
            {!ready ? '로딩...' : playing ? '⏸ 일시정지' : '▶ 재생'}
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {fmt(currentTime)} / {fmt(duration)}
          </span>
        </div>
      </div>

      {/* 저장 메시지 */}
      {savedMsg && (
        <div style={{
          fontSize: '0.75rem', color: savedMsg.includes('실패') ? '#EF4444' : 'var(--teal)',
          marginBottom: '0.5rem', textAlign: 'center',
        }}>
          {savedMsg}
        </div>
      )}

      {/* 화자별 카드 */}
      {speakerStats.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '0.5rem',
        }}>
          {speakerStats.map(({ speaker, name, totalSec, longest, color }) => {
            const pct = duration > 0 ? Math.round((totalSec / duration) * 100) : 0
            return (
              <div key={speaker} style={{
                background: 'var(--bg-card)', border: `1px solid ${color}33`,
                borderRadius: '8px', padding: '0.75rem',
                borderLeft: `3px solid ${color}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  {editingSpeaker === speaker ? (
                    <div style={{ display: 'flex', gap: '0.25rem', flex: 1 }}>
                      <input
                        autoFocus
                        value={editingMap[speaker] ?? name}
                        onChange={e => setEditingMap(prev => ({ ...prev, [speaker]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveSpeakerMap(editingMap) }}
                        style={{
                          flex: 1, padding: '0.2rem 0.4rem', background: 'var(--bg-hover)',
                          border: `1px solid ${color}`, borderRadius: '4px',
                          color: 'var(--text)', fontSize: '0.8rem', outline: 'none',
                        }}
                      />
                      <button
                        onClick={() => saveSpeakerMap(editingMap)}
                        disabled={savingMap}
                        style={{
                          padding: '0.2rem 0.5rem', background: color,
                          border: 'none', borderRadius: '4px', color: '#000',
                          fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {savingMap ? '...' : '✓'}
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setEditingMap(prev => ({ ...prev, [speaker]: name }))
                        setEditingSpeaker(speaker)
                      }}
                      style={{
                        fontWeight: 700, fontSize: '0.85rem', color, cursor: 'pointer',
                      }}
                      title="클릭해서 이름 수정"
                    >
                      🎙️ {name} ✏️
                    </span>
                  )}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {pct}%
                  </span>
                </div>
                {/* 발화 비율 바 */}
                <div style={{ height: 4, background: '#333', borderRadius: 2, marginBottom: '0.5rem' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                </div>
                <button
                  onClick={() => longest && play10s(longest.start)}
                  disabled={!ready}
                  style={{
                    width: '100%', padding: '0.3rem', background: `${color}15`,
                    border: `1px solid ${color}33`, borderRadius: '5px',
                    color, cursor: ready ? 'pointer' : 'not-allowed', fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  🔊 10초 재생
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
