-- Daily Duty Tracker — Supabase schema.
-- Run once: Supabase dashboard → SQL Editor → New query → paste this file → Run.
-- Safe to run again (it only creates what is missing and replaces the trigger function).

-- One row per synced record (a day's entry, a place, a category, an amount field, profile, settings).
create table if not exists public.records (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind              text        not null check (kind in ('entry', 'place', 'category', 'field', 'profile', 'settings')),
  id                text        not null check (char_length(id) between 1 and 64),
  data              jsonb,
  deleted           boolean     not null default false,          -- soft delete (tombstone)
  client_updated_at bigint      not null,                        -- when the phone made the edit (ms)
  seq               bigint      not null default 0,              -- server order, used as the sync cursor
  updated_at        timestamptz not null default now(),
  primary key (user_id, kind, id),
  constraint records_data_size check (data is null or pg_column_size(data) < 200000)
);

create sequence if not exists public.records_seq;
create index if not exists records_user_seq on public.records (user_id, seq);

-- Newest edit wins: an older edit never overwrites a newer one. Every accepted write gets a new seq.
create or replace function public.records_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    return null;  -- keep the newer row that is already stored
  end if;
  new.user_id := coalesce(old.user_id, new.user_id);
  new.seq := nextval('public.records_seq');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists records_stamp on public.records;
create trigger records_stamp
before insert or update on public.records
for each row execute function public.records_stamp();

-- Row-level security: each person can only read and write their own rows. No hard deletes.
alter table public.records enable row level security;

drop policy if exists "Read own records" on public.records;
create policy "Read own records" on public.records
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Insert own records" on public.records;
create policy "Insert own records" on public.records
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own records" on public.records;
create policy "Update own records" on public.records
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.records from anon;
grant select, insert, update on public.records to authenticated;
