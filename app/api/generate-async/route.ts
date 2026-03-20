import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { publishMessage } from '@/lib/kafka'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { transcript, title, speakerMappings } = await req.json()

    if (!transcript?.trim()) {
      return NextResponse.json({ error: '전사 내용이 필요합니다.' }, { status: 400 })
    }

    const jobId = crypto.randomUUID()

    // Kafka에 이벤트 발행
    await publishMessage('meeting.generate', jobId, {
      jobId,
      title: title?.trim() || '회의록',
      transcript,
      speakerMappings: speakerMappings?.filter((m: { speaker: string }) => m.speaker?.trim()) ?? [],
    })

    // Firestore에 job 상태 기록
    const db = getAdminDb()
    await db.collection('jobs').doc(jobId).set({
      status: 'queued',
      title: title?.trim() || '회의록',
      createdAt: new Date(),
    })

    return NextResponse.json({ jobId })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kafka 발행 오류' },
      { status: 500 },
    )
  }
}
