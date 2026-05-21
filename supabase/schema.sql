-- 在 Supabase 的 SQL Editor 里执行一次即可
create table if not exists public.analyses (
  id          uuid primary key default gen_random_uuid(),
  symbol      text not null,
  name        text,
  price       numeric,
  change_pct  numeric,
  summary     text not null,
  sentiment   text not null check (sentiment in ('Bullish','Neutral','Bearish')),
  risk_level  text not null check (risk_level in ('Low','Medium','High')),
  key_factors jsonb,
  raw_quote   jsonb,
  created_at  timestamptz default now()
);

create index if not exists analyses_symbol_idx on public.analyses (symbol);
create index if not exists analyses_created_at_idx on public.analyses (created_at desc);

-- 开启 RLS，并允许 anon key 读写（演示用，生产环境请改成更严格的策略）
alter table public.analyses enable row level security;

drop policy if exists "anon can read" on public.analyses;
create policy "anon can read" on public.analyses for select to anon using (true);

drop policy if exists "anon can insert" on public.analyses;
create policy "anon can insert" on public.analyses for insert to anon with check (true);
