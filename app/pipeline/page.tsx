'use client'

import { useState, useEffect, useCallback } from 'react'
import ReactFlow, {
  Node, Edge, Background, Controls, MiniMap,
  Position, Handle, NodeProps, useNodesState, useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

// ── 타입 ─────────────────────────────────────────────────────────────────────
type PipelineData = {
  firestore: {
    totalNotes: number; todayNotes: number; editedNotes: number
    ratedNotes: number; dpoReady: number; recentTitle: string; recentDate: string
  }
  whisper: { online: boolean; model: string; diarization: boolean }
  hfDataset: { sftCount: number; dpoCount: number; repo: string }
  kafka: { topic: string; status: string }
  training: { model: string; sftModel: string; schedule: string }
}

type PipelineNodeData = {
  label: string
  icon: string
  status: 'active' | 'idle' | 'warning' | 'error'
  stats: { label: string; value: string | number }[]
  description: string
  actions?: { label: string; onClick: () => void }[]
}

// ── 커스텀 노드 ──────────────────────────────────────────────────────────────
const statusColors = {
  active: '#14b8a6',
  idle: '#6b7280',
  warning: '#f59e0b',
  error: '#ef4444',
}

function PipelineNode({ data, selected }: NodeProps<PipelineNodeData>) {
  const color = statusColors[data.status]
  return (
    <div style={{
      background: 'var(--bg-card, #1a1a2e)',
      border: `2px solid ${selected ? '#f59e0b' : color}`,
      borderRadius: '12px',
      padding: '1rem',
      minWidth: '180px',
      maxWidth: '220px',
      boxShadow: selected ? `0 0 20px ${color}40` : `0 2px 8px rgba(0,0,0,0.3)`,
      transition: 'all 0.2s',
      cursor: 'pointer',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: color, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: color, width: 8, height: 8 }} />

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <span style={{ fontSize: '1.25rem' }}>{data.icon}</span>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text, #e0e0e0)' }}>{data.label}</span>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: color,
          marginLeft: 'auto', boxShadow: `0 0 6px ${color}`,
        }} />
      </div>

      {/* 통계 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {data.stats.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
            <span style={{ color: 'var(--text-muted, #888)' }}>{s.label}</span>
            <span style={{ color: 'var(--text, #e0e0e0)', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const nodeTypes = { pipeline: PipelineNode }

// ── 사이드 패널 ──────────────────────────────────────────────────────────────
function DetailPanel({ node, onClose, onAction }: {
  node: Node<PipelineNodeData> | null
  onClose: () => void
  onAction: (action: string) => void
}) {
  if (!node) return null
  const data = node.data
  const color = statusColors[data.status]

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: '320px', zIndex: 10,
      background: 'var(--bg-card, #1a1a2e)', borderLeft: `2px solid ${color}`,
      padding: '1.5rem', overflowY: 'auto',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.4)',
    }}>
      {/* 닫기 */}
      <button onClick={onClose} style={{
        position: 'absolute', top: '1rem', right: '1rem',
        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem',
      }}>✕</button>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '2rem' }}>{data.icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)' }}>{data.label}</div>
          <div style={{ fontSize: '0.75rem', color, fontWeight: 600, textTransform: 'uppercase' }}>{data.status}</div>
        </div>
      </div>

      {/* 설명 */}
      <div style={{
        fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7,
        marginBottom: '1.25rem', padding: '0.75rem',
        background: 'var(--bg-hover, #222244)', borderRadius: '8px',
      }}>
        {data.description}
      </div>

      {/* 통계 상세 */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
          상세 현황
        </div>
        {data.stats.map((s, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0',
            borderBottom: '1px solid var(--border, #333)',
            fontSize: '0.82rem',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            <span style={{ color: 'var(--text)', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* 액션 버튼 */}
      {data.actions && data.actions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.actions.map((a, i) => (
            <button key={i} onClick={() => onAction(a.label)} style={{
              padding: '0.6rem 1rem', background: i === 0 ? 'var(--amber, #f59e0b)' : 'var(--bg-hover)',
              color: i === 0 ? '#000' : 'var(--text)',
              border: i === 0 ? 'none' : '1px solid var(--border)',
              borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem',
            }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function PipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<Node<PipelineNodeData> | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline')
      if (res.ok) {
        const d = await res.json()
        setData(d)
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // 데이터가 로드되면 노드/엣지 업데이트
  useEffect(() => {
    if (!data) return

    const fs = data.firestore
    const wh = data.whisper
    const hf = data.hfDataset
    const tr = data.training

    const newNodes: Node<PipelineNodeData>[] = [
      // Row 1: 입력 → 전사 → 생성 → 저장
      {
        id: 'recording', type: 'pipeline', position: { x: 50, y: 50 },
        data: {
          label: '녹음/업로드', icon: '🎙️', status: 'active',
          stats: [
            { label: '오늘', value: `${fs.todayNotes}건` },
            { label: '전체', value: `${fs.totalNotes}건` },
          ],
          description: '브라우저 녹음, 파일 업로드, 텍스트 입력으로 회의 내용을 받아요. 회의실 모드에서는 마이크 감도를 높여서 먼 거리 음성도 잡아요.',
          actions: [
            { label: '새 회의록 만들기', onClick: () => {} },
          ],
        },
      },
      {
        id: 'transcribe', type: 'pipeline', position: { x: 300, y: 50 },
        data: {
          label: 'Whisper + pyannote', icon: '📝', status: wh.online ? 'active' : 'idle',
          stats: [
            { label: 'STT', value: wh.online ? `Whisper ${wh.model}` : 'paused' },
            { label: '화자분리', value: wh.diarization ? 'pyannote 3.1' : 'OFF' },
            { label: 'fallback', value: 'Gemini 2.5' },
          ],
          description: 'Whisper large-v3 (한국어 전문 STT) + pyannote 3.1 (화자분리)로 음성을 전사해요. GPU(T4)에서 실행되고, 필요할 때만 자동으로 깨어나요. Gemini는 fallback으로 유지.',
          actions: [
            { label: 'Whisper Space 깨우기', onClick: () => {} },
            { label: 'HF Space 보기', onClick: () => {} },
          ],
        },
      },
      {
        id: 'generate', type: 'pipeline', position: { x: 550, y: 50 },
        data: {
          label: '회의록 생성', icon: '🤖', status: 'active',
          stats: [
            { label: 'Claude', value: 'Sonnet 4.6' },
            { label: 'Qwen', value: '3-8B (로컬)' },
            { label: '최근', value: fs.recentTitle.slice(0, 12) },
          ],
          description: 'Claude Sonnet이 전사 텍스트를 MYSC 용어와 멤버 이름을 반영한 구조화된 회의록으로 변환해요. 긴 회의는 청크 분할 후 병렬 처리해요.',
        },
      },
      {
        id: 'firestore', type: 'pipeline', position: { x: 800, y: 50 },
        data: {
          label: 'Firestore', icon: '💾', status: 'active',
          stats: [
            { label: '전체 노트', value: fs.totalNotes },
            { label: '편집된', value: fs.editedNotes },
            { label: '평가된', value: fs.ratedNotes },
            { label: 'DPO 쌍', value: fs.dpoReady },
          ],
          description: '회의록, 전사본, AI 원본(generatedContent), 편집 이력(contentRevisions), 품질 평가(qualityRating)가 모두 저장돼요. 사용자의 교정이 곧 학습 데이터예요.',
          actions: [
            { label: '회의록 목록 보기', onClick: () => {} },
          ],
        },
      },
      // Row 2: Kafka → HF Dataset → 학습 → 모델
      {
        id: 'kafka', type: 'pipeline', position: { x: 800, y: 280 },
        data: {
          label: 'Kafka', icon: '📡',
          status: data.kafka.status === 'configured' ? 'active' : 'warning',
          stats: [
            { label: '토픽', value: 'training.sync' },
            { label: '상태', value: data.kafka.status === 'configured' ? '연결됨' : '미설정' },
          ],
          description: '회의록 생성/편집 시 자동으로 training.sync 토픽에 이벤트를 발행해요. Training Worker가 이벤트를 소비해서 HF Dataset에 push해요.',
        },
      },
      {
        id: 'hf-dataset', type: 'pipeline', position: { x: 550, y: 280 },
        data: {
          label: 'HF Dataset', icon: '📦',
          status: (hf.sftCount + hf.dpoCount) > 0 ? 'active' : 'idle',
          stats: [
            { label: 'SFT 데이터', value: `${hf.sftCount}건` },
            { label: 'DPO 데이터', value: `${hf.dpoCount}건` },
            { label: '레포', value: hf.repo.split('/').pop() ?? '-' },
          ],
          description: 'Kafka에서 자동으로 수집된 SFT/DPO 학습 데이터가 쌓이는 곳이에요. SFT(transcript→회의록) + DPO(AI원본 vs 사용자교정) 형태로 저장돼요.',
          actions: [
            { label: 'HF에서 데이터 보기', onClick: () => {} },
          ],
        },
      },
      {
        id: 'training', type: 'pipeline', position: { x: 300, y: 280 },
        data: {
          label: 'SFT / DPO', icon: '🏋️',
          status: hf.sftCount >= 20 ? 'active' : 'warning',
          stats: [
            { label: '베이스', value: 'Qwen3-8B' },
            { label: '방식', value: 'LoRA (QLoRA)' },
            { label: '스케줄', value: tr.schedule },
            { label: 'SFT 준비', value: hf.sftCount >= 20 ? '✓ 가능' : `${hf.sftCount}/20건` },
          ],
          description: '데이터가 충분히 쌓이면 HF Jobs에서 Qwen3-8B를 LoRA 파인튜닝해요. SFT로 회의록 스타일을 학습하고, DPO로 사용자 선호도에 맞게 정렬해요.',
          actions: [
            { label: 'SFT 학습 시작', onClick: () => {} },
            { label: 'DPO 학습 시작', onClick: () => {} },
          ],
        },
      },
      {
        id: 'model', type: 'pipeline', position: { x: 50, y: 280 },
        data: {
          label: '파인튜닝 모델', icon: '🧠', status: 'idle',
          stats: [
            { label: '모델', value: 'Qwen3-8B' },
            { label: '상태', value: '학습 대기' },
          ],
          description: '파인튜닝된 Qwen 모델이 Ollama를 통해 Docker worker에서 실행돼요. MYSC 용어, 회의록 포맷, 사용자 선호도를 학습한 커스텀 모델이에요.',
        },
      },
    ]

    const newEdges: Edge[] = [
      // Row 1 (좌 → 우)
      { id: 'e1', source: 'recording', target: 'transcribe', animated: true, style: { stroke: '#f59e0b' } },
      { id: 'e2', source: 'transcribe', target: 'generate', animated: true, style: { stroke: '#f59e0b' } },
      { id: 'e3', source: 'generate', target: 'firestore', animated: true, style: { stroke: '#f59e0b' } },
      // Row 1 → Row 2 (아래로)
      { id: 'e4', source: 'firestore', target: 'kafka', animated: true, style: { stroke: '#14b8a6' } },
      // Row 2 (우 → 좌)
      { id: 'e5', source: 'kafka', target: 'hf-dataset', animated: true, style: { stroke: '#14b8a6' } },
      { id: 'e6', source: 'hf-dataset', target: 'training', animated: true, style: { stroke: '#14b8a6' } },
      { id: 'e7', source: 'training', target: 'model', animated: true, style: { stroke: '#14b8a6' } },
      // 피드백 루프 (모델 → 생성)
      { id: 'e8', source: 'model', target: 'generate', animated: false,
        style: { stroke: '#8b5cf6', strokeDasharray: '5 5' },
        label: '모델 업데이트', labelStyle: { fill: '#8b5cf6', fontSize: 10 },
      },
    ]

    setNodes(newNodes)
    setEdges(newEdges)
  }, [data, setNodes, setEdges])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<PipelineNodeData>) => {
    setSelectedNode(node)
  }, [])

  const handleAction = (action: string) => {
    if (action === '새 회의록 만들기') window.location.href = '/upload'
    else if (action === '회의록 목록 보기') window.location.href = '/notes'
    else if (action === 'HF에서 데이터 보기') {
      const repo = data?.hfDataset.repo
      if (repo) window.open(`https://huggingface.co/datasets/${repo}`, '_blank')
    }
    else if (action === 'Whisper Space 깨우기') {
      window.open('https://huggingface.co/spaces/boramintheMYSC/merrynote-whisper-diarize', '_blank')
    }
    else alert(`${action} — 준비 중이에요!`)
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>파이프라인 로딩 중...</div>
  }

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {/* 제목 바 */}
      <div style={{
        position: 'absolute', top: '1rem', left: '1rem', zIndex: 5,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '0.75rem 1.25rem',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>
          MerryNote AI Pipeline
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
          회의록 생성 → DPO 데이터 수집 → 모델 학습 플라이휠
        </div>
      </div>

      {/* 범례 */}
      <div style={{
        position: 'absolute', bottom: '1rem', left: '1rem', zIndex: 5,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '8px', padding: '0.6rem 1rem', fontSize: '0.7rem',
        display: 'flex', gap: '1rem', color: 'var(--text-muted)',
      }}>
        {[
          { color: '#f59e0b', label: '회의록 생성' },
          { color: '#14b8a6', label: '학습 파이프라인' },
          { color: '#8b5cf6', label: '피드백 루프' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: 12, height: 3, background: l.color, borderRadius: 2, display: 'inline-block' }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* React Flow */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--bg, #0f0f23)' }}
      >
        <Background color="#333" gap={20} size={1} />
        <Controls
          showInteractive={false}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
        />
        <MiniMap
          nodeColor={() => '#f59e0b'}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
        />
      </ReactFlow>

      {/* 사이드 패널 */}
      <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} onAction={handleAction} />
    </div>
  )
}
