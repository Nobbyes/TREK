-- Run once in the Supabase SQL Editor.
create table if not exists public.trek_itineraries (
  slug text primary key,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null
);

create table if not exists public.trek_editors (
  email text primary key,
  added_at timestamptz not null default now()
);

alter table public.trek_itineraries enable row level security;
alter table public.trek_editors enable row level security;

revoke all on table public.trek_itineraries from anon, authenticated;
revoke all on table public.trek_editors from anon, authenticated;
grant select on table public.trek_itineraries to anon, authenticated;
grant insert, update on table public.trek_itineraries to authenticated;
grant select on table public.trek_editors to authenticated;

drop policy if exists "Public can read TREK" on public.trek_itineraries;
create policy "Public can read TREK"
  on public.trek_itineraries for select
  to anon, authenticated
  using (true);

drop policy if exists "Editors can view their access" on public.trek_editors;
create policy "Editors can view their access"
  on public.trek_editors for select
  to authenticated
  using (lower(email) = lower((select auth.jwt()->>'email')));

drop policy if exists "Editors can create TREK" on public.trek_itineraries;
create policy "Editors can create TREK"
  on public.trek_itineraries for insert
  to authenticated
  with check (
    exists (
      select 1 from public.trek_editors
      where lower(email) = lower((select auth.jwt()->>'email'))
    )
  );

drop policy if exists "Editors can update TREK" on public.trek_itineraries;
create policy "Editors can update TREK"
  on public.trek_itineraries for update
  to authenticated
  using (
    exists (
      select 1 from public.trek_editors
      where lower(email) = lower((select auth.jwt()->>'email'))
    )
  )
  with check (
    exists (
      select 1 from public.trek_editors
      where lower(email) = lower((select auth.jwt()->>'email'))
    )
  );

-- Add each invited editor after creating or inviting the account in Authentication > Users.
-- insert into public.trek_editors (email) values ('you@example.com'), ('partner@example.com');

