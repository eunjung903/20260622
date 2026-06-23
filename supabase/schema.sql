-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.lotto_draws (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  source text not null default 'draw' check (source in ('draw', 'saju')),
  games jsonb not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lotto_draws_client_created_idx
  on public.lotto_draws (client_id, created_at desc);

alter table public.lotto_draws enable row level security;

-- API는 service role key로 접근하므로 RLS 정책은 선택 사항입니다.
-- anon key를 클라이언트에서 직접 쓸 경우를 대비한 예시 정책:
-- create policy "read own draws" on public.lotto_draws
--   for select using (true);
-- create policy "insert own draws" on public.lotto_draws
--   for insert with check (true);
