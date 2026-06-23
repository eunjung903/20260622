-- Supabase SQL Editor에서 실행하세요.
-- (이미 테이블을 만든 경우에도 아래 ALTER는 안전하게 재실행 가능합니다.)

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

-- API는 service_role key로 접근합니다. RLS는 비활성화합니다.
alter table public.lotto_draws disable row level security;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on public.lotto_draws to postgres, service_role;
grant select, insert, delete on public.lotto_draws to anon, authenticated;
