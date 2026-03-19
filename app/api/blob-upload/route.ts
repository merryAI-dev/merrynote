// Vercel Blob 클라이언트 직접 업로드 핸들러
// 브라우저 → Vercel Blob (서버 경유 없음 → 4.5MB 제한 우회)
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const SUPPORTED = ['m4a', 'mp3', 'mp4', 'wav', 'ogg', 'flac', 'webm', 'aac', 'caf', 'mpeg']
const MAX_SIZE_MB = 100  // Vercel Blob 업로드 허용 최대 크기

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const ext = pathname.split('.').pop()?.toLowerCase() ?? ''
        if (!SUPPORTED.includes(ext)) {
          throw new Error(`지원하지 않는 형식입니다. (지원: ${SUPPORTED.map(e => '.' + e).join(' ')})`)
        }
        return {
          allowedContentTypes: ['audio/*', 'video/*', 'application/octet-stream'],
          maximumSizeInBytes: MAX_SIZE_MB * 1024 * 1024,
          tokenPayload: JSON.stringify({ pathname }),
        }
      },
      onUploadCompleted: async ({ blob }) => {
        // 업로드 완료 후 추가 작업 가능 (로깅 등)
        console.log('[blob-upload] 완료:', blob.url)
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '업로드 토큰 생성 실패' },
      { status: 400 },
    )
  }
}
