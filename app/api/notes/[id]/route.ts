import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { generateEmbedding } from '@/lib/gemini'
import { publishMessage } from '@/lib/kafka'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getAdminDb()
    const doc = await db.collection('notes').doc(id).get()

    if (!doc.exists) {
      return NextResponse.json({ error: '노트를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data()?.createdAt?.toDate?.()?.toISOString() ?? doc.data()?.createdAt,
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB 오류' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json() as {
      title?: string; content?: string
      speakerMap?: Record<string, string>
      qualityRating?: 'good' | 'ok' | 'poor'
    }

    // 품질 평가만 업데이트하는 경우
    if (body.qualityRating && !body.title && !body.speakerMap) {
      const db = getAdminDb()
      await db.collection('notes').doc(id).update({
        qualityRating: body.qualityRating,
        updatedAt: new Date(),
      })
      return NextResponse.json({ id, qualityRating: body.qualityRating })
    }

    // 화자 매핑만 업데이트하는 경우
    if (body.speakerMap && !body.title) {
      const db = getAdminDb()
      // 기존 speakerMap과 비교해서 corrections 기록
      const doc = await db.collection('notes').doc(id).get()
      const oldMap = (doc.data()?.speakerMap ?? {}) as Record<string, string>
      const corrections: { from: string; to: string; speaker: string; correctedAt: string }[] = []
      for (const [speaker, newName] of Object.entries(body.speakerMap)) {
        const oldName = oldMap[speaker] ?? speaker
        if (oldName !== newName && newName.trim()) {
          corrections.push({ from: oldName, to: newName, speaker, correctedAt: new Date().toISOString() })
        }
      }

      const updates: Record<string, unknown> = {
        speakerMap: body.speakerMap,
        updatedAt: new Date(),
      }
      if (corrections.length > 0) {
        updates.speakerCorrections = FieldValue.arrayUnion(...corrections)
      }
      await db.collection('notes').doc(id).update(updates)
      return NextResponse.json({ id, speakerMap: body.speakerMap, corrections: corrections.length })
    }

    // 일반 제목/본문 수정
    const { title, content } = body
    if (!title?.trim()) return NextResponse.json({ error: '제목은 필수입니다.' }, { status: 400 })

    const db = getAdminDb()

    // DPO: 편집 전 버전을 contentRevisions에 보존
    const doc = await db.collection('notes').doc(id).get()
    const prevData = doc.data()

    const updates: Record<string, unknown> = {
      title: title.trim(),
      content: content ?? '',
      updatedAt: new Date(),
      word_count: (content ?? '').split(/\s+/).filter(Boolean).length,
      editCount: (prevData?.editCount ?? 0) + 1,
    }

    // 본문이 실제로 변경된 경우에만 revision 추가
    if (prevData?.content && prevData.content !== (content ?? '')) {
      updates.contentRevisions = FieldValue.arrayUnion({
        content: prevData.content,
        editedAt: new Date().toISOString(),
      })
    }

    if (process.env.GEMINI_API_KEY) {
      try {
        updates.embedding = await generateEmbedding(`${title}\n\n${content}`)
      } catch { /* 임베딩 실패해도 저장은 진행 */ }
    }

    await db.collection('notes').doc(id).update(updates)

    // Kafka: 편집 이벤트 → 학습 데이터 동기화
    if (prevData?.content && prevData.content !== (content ?? '')) {
      publishMessage('training.sync', id, {
        type: 'note_edited',
        noteId: id,
        title: title?.trim(),
        content: content ?? '',
        transcript: prevData.transcript ?? null,
        generatedContent: prevData.generatedContent ?? null,
        previousContent: prevData.content,
      }).catch(() => {})
    }

    return NextResponse.json({ id, title: updates.title, content: updates.content })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB 오류' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getAdminDb()
    await db.collection('notes').doc(id).delete()
    return new NextResponse(null, { status: 204 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB 오류' }, { status: 500 })
  }
}
