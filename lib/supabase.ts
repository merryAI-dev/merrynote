import { createClient } from '@supabase/supabase-js'

export type Note = {
  id: string
  title: string
  content: string
  transcript: string | null
  audio_url: string | null
  word_count: number | null
  duration_min: number | null
  created_at: string
  user_id: string | null
}

export type Vocab = {
  key: string
  content: string
  updated_at: string
}

// 클라이언트사이드용 (lazy)
export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// 서버사이드 전용 (API Routes에서 사용)
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
