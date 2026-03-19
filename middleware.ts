import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER
  const pass = process.env.BASIC_AUTH_PASS

  // 환경변수 미설정 시 통과 (로컬 개발 편의)
  if (!user || !pass) return NextResponse.next()

  const auth = req.headers.get('authorization') ?? ''
  if (auth.startsWith('Basic ')) {
    // Edge Runtime에서 atob 대신 직접 base64 비교
    const expected = btoa(`${user}:${pass}`)
    if (auth.slice(6) === expected) return NextResponse.next()
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="MerryNote"' },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
