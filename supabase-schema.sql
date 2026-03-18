-- yapnotes Supabase 스키마
-- Supabase > SQL Editor에서 실행하세요

-- 회의록 테이블
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  transcript text,
  audio_url text,
  word_count int,
  duration_min int,
  created_at timestamptz default now(),
  user_id uuid references auth.users
);

-- 최신순 인덱스
create index if not exists notes_created_at_idx on notes(created_at desc);

-- 전문 검색 인덱스 (선택)
create index if not exists notes_content_idx on notes using gin(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'')));

-- Row Level Security (인증 사용 시)
-- alter table notes enable row level security;
-- create policy "users can manage own notes" on notes for all using (auth.uid() = user_id);

-- 단어장 테이블
create table if not exists vocab (
  key text primary key,
  content text not null,
  updated_at timestamptz default now()
);
