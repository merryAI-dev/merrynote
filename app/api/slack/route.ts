import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Slack이 설정되지 않았습니다.' }, { status: 503 })
  }

  const { channel, title, summary, url } = await req.json()
  if (!channel || !title) {
    return NextResponse.json({ error: '채널과 제목이 필요합니다.' }, { status: 400 })
  }

  const text = [
    `📋 *${title}*`,
    summary ? `\n${summary}` : '',
    url ? `\n🔗 <${url}|회의록 보기>` : '',
  ].filter(Boolean).join('')

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text }),
  })

  const data = await res.json()
  if (!data.ok) {
    return NextResponse.json({ error: data.error ?? 'Slack 전송 실패' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
