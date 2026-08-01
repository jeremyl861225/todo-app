-- =============================================================
--  待辦事項 App — Supabase 資料表
--  用法：Supabase 專案 → 左側 SQL Editor → New query → 全部貼上 → Run
--  可重複執行，不會刪除既有資料。
-- =============================================================

create extension if not exists pgcrypto;

-- ---------- 類別 ----------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#4E6B57',
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------- 重複排程（頁面一）----------
create table if not exists public.schedules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  description text default '',
  freq        text not null check (freq in ('daily','weekly','biweekly','monthly','custom')),
  weekday     int,          -- 0=週日 … 6=週六（每週／自訂「每 N 週」／每月第 N 個星期幾用）
  month_mode  text check (month_mode is null or month_mode in ('day','nth')),
                            -- 每月的落點：'day'=幾號、'nth'=第 N 個星期幾
  week_of_month int check (week_of_month is null or week_of_month in (1,2,3,4,-1)),
                            -- 1..4=第一～第四個，-1=最後一個
  month_day   int,          -- 1..31（month_mode='day' 時用）
  interval_n  int,          -- 自訂：間隔數 N
  custom_unit text check (custom_unit is null or custom_unit in ('day','week','month')),
  anchor_date date,         -- 舊資料的每兩週起算日，新資料一律用 start_date
  start_date  date,         -- 起始日（程式端必填，這天以前不出現）
  end_date    date,         -- 結束日（選填，null = 持續進行）
  time_text   text default '',
  category    text default '',
  important   boolean not null default false,   -- 重大事件
  links       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  constraint schedules_range_check
    check (end_date is null or start_date is null or end_date >= start_date)
);

-- ---------- 單一行程（頁面二）----------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  description text default '',
  date        date not null,   -- 開始日
  end_date    date,            -- 結束日（選填，null = 單日；跨多日活動用）
  time_text   text default '',
  category    text default '',
  important   boolean not null default false,   -- 重大事件
  links       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  constraint events_range_check check (end_date is null or end_date >= date)
);

-- ---------- 完成紀錄（某項目在某一天被勾選）----------
create table if not exists public.completions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     uuid not null,
  item_kind   text not null check (item_kind in ('schedule','event')),
  occur_date  date not null,
  created_at  timestamptz not null default now(),
  unique (user_id, item_id, occur_date)
);

create index if not exists completions_lookup
  on public.completions (user_id, occur_date);
create index if not exists schedules_user on public.schedules (user_id);
create index if not exists events_user_date on public.events (user_id, date);
create index if not exists events_user_range on public.events (user_id, date, end_date);

-- =============================================================
--  Row Level Security：每個人只看得到自己的資料
-- =============================================================
alter table public.categories  enable row level security;
alter table public.schedules   enable row level security;
alter table public.events      enable row level security;
alter table public.completions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['categories','schedules','events','completions'] loop
    execute format('drop policy if exists own_select on public.%I', t);
    execute format('drop policy if exists own_insert on public.%I', t);
    execute format('drop policy if exists own_update on public.%I', t);
    execute format('drop policy if exists own_delete on public.%I', t);

    execute format('create policy own_select on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy own_insert on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy own_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy own_delete on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;
