-- Quran Reader — Supabase schema
-- =================================================================
-- Run this once in the Supabase SQL Editor
-- (Project Dashboard → SQL Editor → "New Query" → paste → Run)
--
-- Safe to re-run: all statements are idempotent.
-- =================================================================

-- 1) Per-user data table ------------------------------------------------

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Bookmarks: array of { s, a, ts } — surah, ayah in surah, timestamp
  bookmarks jsonb default '[]'::jsonb,
  bookmarks_updated_at timestamptz,

  -- Last-read position: { surah, ayah, ts }
  last_read jsonb,
  last_read_updated_at timestamptz,

  -- Reading settings: { fontScale, lineScale, theme }
  reading_settings jsonb default '{}'::jsonb,
  reading_settings_updated_at timestamptz,

  -- Prayer settings: { lat, lon, label, method, madhab }
  prayer_settings jsonb default '{}'::jsonb,
  prayer_settings_updated_at timestamptz,

  created_at timestamptz default now()
);

-- 2) Row-level security — users can only access their own row -----------

alter table public.user_data enable row level security;

drop policy if exists "own_select" on public.user_data;
drop policy if exists "own_insert" on public.user_data;
drop policy if exists "own_update" on public.user_data;
drop policy if exists "own_delete" on public.user_data;

create policy "own_select" on public.user_data
  for select using (auth.uid() = user_id);
create policy "own_insert" on public.user_data
  for insert with check (auth.uid() = user_id);
create policy "own_update" on public.user_data
  for update using (auth.uid() = user_id);
create policy "own_delete" on public.user_data
  for delete using (auth.uid() = user_id);

-- 3) Abuse / cost guards ------------------------------------------------
--
-- Caps bookmarks at 500 items and total row size at ~50KB. Stops a
-- single user from blowing up the free-tier storage budget.

create or replace function public.enforce_user_data_caps()
returns trigger
language plpgsql
as $$
declare
  bookmarks_count int;
  row_size int;
begin
  if new.bookmarks is not null then
    bookmarks_count := jsonb_array_length(new.bookmarks);
    if bookmarks_count > 500 then
      raise exception 'bookmarks capped at 500 items (got %)', bookmarks_count;
    end if;
  end if;

  row_size :=
    coalesce(octet_length(new.bookmarks::text), 0) +
    coalesce(octet_length(new.last_read::text), 0) +
    coalesce(octet_length(new.reading_settings::text), 0) +
    coalesce(octet_length(new.prayer_settings::text), 0);
  if row_size > 51200 then
    raise exception 'user data row exceeds 50KB (%) — reduce bookmarks', row_size;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_user_data_caps_trigger on public.user_data;
create trigger enforce_user_data_caps_trigger
  before insert or update on public.user_data
  for each row execute function public.enforce_user_data_caps();

-- 4) Auto-create row on user signup (optional, keeps writes simpler) ----
--
-- When a user signs up, create an empty user_data row. This way the
-- client can always UPSERT instead of INSERT-or-UPDATE logic.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.user_data (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) Backfill — safe to run repeatedly ---------------------------------
-- Creates an empty user_data row for any existing auth user who
-- signed up before the trigger was installed.

insert into public.user_data (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- =================================================================
-- Verification queries (run after setup to confirm):
-- =================================================================
--   select * from public.user_data limit 1;
--   select polname, polcmd from pg_policy where polrelid = 'public.user_data'::regclass;
