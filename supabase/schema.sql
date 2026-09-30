-- Intakeroute: database, beveiliging en realtime
-- Uitvoeren in Supabase > SQL Editor (eenmalig).

-- Teamleden: alleen wie hierin staat, komt bij de gegevens.
create table if not exists public.teamleden (
  email text primary key check (email = lower(email)),
  naam text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.dossiers (
  id uuid primary key default gen_random_uuid(),
  dossiernummer text not null default '',
  naam text not null default '',
  bewindvoerder text not null default '',
  assistent text not null default '',
  beschikking date,
  notitie text not null default '',
  archived boolean not null default false,
  example boolean not null default false,
  status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.instellingen (
  sleutel text primary key,
  waarde jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Is de ingelogde gebruiker een teamlid?
create or replace function public.is_teamlid()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teamleden where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.mijn_naam()
returns text language sql stable security definer set search_path = public as $$
  select naam from public.teamleden where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Wie en wanneer automatisch bijhouden
create or replace function public.stempel_dossier()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := public.mijn_naam();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := new.updated_by;
  end if;
  return new;
end $$;

create or replace function public.stempel_instelling()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := public.mijn_naam();
  return new;
end $$;

drop trigger if exists dossiers_stempel on public.dossiers;
create trigger dossiers_stempel before insert or update on public.dossiers
  for each row execute function public.stempel_dossier();

drop trigger if exists instellingen_stempel on public.instellingen;
create trigger instellingen_stempel before insert or update on public.instellingen
  for each row execute function public.stempel_instelling();

-- Eén stap bijwerken zonder wijzigingen van collega's aan andere stappen te overschrijven.
-- p_patch bevat {"s": "open|bezig|klaar|nvt"} en/of {"n": "notitie"}.
create or replace function public.set_step(p_dossier uuid, p_step text, p_patch jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb) - 'd' - 'by';
begin
  if v_patch ? 's' then
    if v_patch ->> 's' not in ('open', 'bezig', 'klaar', 'nvt') then
      raise exception 'Ongeldige status %', v_patch ->> 's';
    end if;
    if v_patch ->> 's' = 'open' then
      v_patch := v_patch || jsonb_build_object('d', null, 'by', null);
    else
      v_patch := v_patch || jsonb_build_object('d', now(), 'by', public.mijn_naam());
    end if;
  end if;
  update public.dossiers
     set status = jsonb_set(status, array[p_step], coalesce(status -> p_step, '{}'::jsonb) || v_patch, true)
   where id = p_dossier;
end $$;

-- Row Level Security
alter table public.teamleden enable row level security;
alter table public.dossiers enable row level security;
alter table public.instellingen enable row level security;

drop policy if exists "teamleden lezen" on public.teamleden;
create policy "teamleden lezen" on public.teamleden
  for select to authenticated using (public.is_teamlid());

drop policy if exists "dossiers lezen" on public.dossiers;
create policy "dossiers lezen" on public.dossiers
  for select to authenticated using (public.is_teamlid());
drop policy if exists "dossiers toevoegen" on public.dossiers;
create policy "dossiers toevoegen" on public.dossiers
  for insert to authenticated with check (public.is_teamlid());
drop policy if exists "dossiers wijzigen" on public.dossiers;
create policy "dossiers wijzigen" on public.dossiers
  for update to authenticated using (public.is_teamlid()) with check (public.is_teamlid());
drop policy if exists "dossiers verwijderen" on public.dossiers;
create policy "dossiers verwijderen" on public.dossiers
  for delete to authenticated using (public.is_teamlid());

drop policy if exists "instellingen lezen" on public.instellingen;
create policy "instellingen lezen" on public.instellingen
  for select to authenticated using (public.is_teamlid());
drop policy if exists "instellingen toevoegen" on public.instellingen;
create policy "instellingen toevoegen" on public.instellingen
  for insert to authenticated with check (public.is_teamlid());
drop policy if exists "instellingen wijzigen" on public.instellingen;
create policy "instellingen wijzigen" on public.instellingen
  for update to authenticated using (public.is_teamlid()) with check (public.is_teamlid());

-- Niet-ingelogde bezoekers krijgen nergens toegang toe
revoke all on public.teamleden, public.dossiers, public.instellingen from anon;
revoke execute on function public.is_teamlid(), public.mijn_naam(), public.set_step(uuid, text, jsonb) from public, anon;
grant execute on function public.is_teamlid(), public.mijn_naam(), public.set_step(uuid, text, jsonb) to authenticated;
-- Ingelogde gebruikers: de policies hierboven bepalen welke rijen ze zien
grant select on public.teamleden to authenticated;
grant select, insert, update, delete on public.dossiers to authenticated;
grant select, insert, update on public.instellingen to authenticated;

-- Live bijwerken op alle apparaten
do $$ begin
  alter publication supabase_realtime add table public.dossiers;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.instellingen;
exception when duplicate_object then null; end $$;

-- Teamleden toevoegen (e-mailadres in kleine letters), bijvoorbeeld:
-- insert into public.teamleden (email, naam) values ('naam@voorbeeld.nl', 'Voornaam');
