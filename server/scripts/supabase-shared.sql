-- ============================================================================
-- Script SQL complet de partage Supabase pour ASUL Volley (v3.3+)
--
-- À exécuter en une seule fois dans Supabase → SQL Editor → New query :
-- https://supabase.com/dashboard/project/fzfryivizuhywfczeqbh/sql/new
--
-- Ce script est idempotent (peut être relancé sans perte de données) et crée :
--   1. public.asul_teams          (Équipes & effectifs)
--   2. public.asul_trajectories   (Fiches de trajectoires)
--   3. public.asul_videos         (Métadonnées des vidéos)
--   4. public.asul_matches        (État des matchs DataVolley)
--   5. public.asul_actions        (Actions codées DataVolley)
--   6. public.asul_events         (Événements : temps morts, remplacements…)
--   7. public.asul_setups         (Six de départ par set)
--   8. public.asul_set_claims     (Attribution collaborative des sets)
--   9. public.asul_live_sessions  (Matchs en direct : code d'accès, membres, actions, événements, positions)
-- ============================================================================

-- Trigger générique : horodatage posé par le serveur Supabase (aucun décalage d'horloge entre PC)
create or replace function public.asul_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- 1. Équipes (asul_teams)
-- ---------------------------------------------------------------------------
create table if not exists public.asul_teams (
  sync_uuid    uuid primary key,
  name         text not null default '',
  players      jsonb not null default '[]'::jsonb,
  libero       integer,
  libero_for   text,
  deleted      boolean not null default false,
  origin_id    text,
  updated_at   timestamptz not null default now()
);
drop trigger if exists asul_teams_touch on public.asul_teams;
create trigger asul_teams_touch before insert or update on public.asul_teams
  for each row execute procedure public.asul_touch();

-- ---------------------------------------------------------------------------
-- 2. Fiches de trajectoires (asul_trajectories)
-- ---------------------------------------------------------------------------
create table if not exists public.asul_trajectories (
  sync_uuid      uuid primary key,
  name           text not null,
  home_team_uuid uuid,
  away_team_uuid uuid,
  team1_name     text,
  team2_name     text,
  status         text default 'open',
  created_by     text,
  shots          jsonb not null default '[]'::jsonb,
  deleted        boolean not null default false,
  origin_id      text,
  updated_at     timestamptz not null default now()
);
alter table public.asul_trajectories add column if not exists created_by text;
drop trigger if exists asul_trajectories_touch on public.asul_trajectories;
create trigger asul_trajectories_touch before insert or update on public.asul_trajectories
  for each row execute procedure public.asul_touch();

-- ---------------------------------------------------------------------------
-- 3. Vidéos — métadonnées seules (asul_videos)
-- ---------------------------------------------------------------------------
create table if not exists public.asul_videos (
  sync_uuid     uuid primary key,
  original_name text,
  display_name  text,
  team1_name    text,
  team2_name    text,
  duration      real,
  status        text default 'uploaded',
  color         text default '#1a73e8',
  deleted       boolean not null default false,
  origin_id     text,
  updated_at    timestamptz not null default now()
);
drop trigger if exists asul_videos_touch on public.asul_videos;
create trigger asul_videos_touch before insert or update on public.asul_videos
  for each row execute procedure public.asul_touch();

-- ---------------------------------------------------------------------------
-- 4. Matchs DataVolley (asul_matches)
-- ---------------------------------------------------------------------------
create table if not exists public.asul_matches (
  sync_uuid      uuid primary key,
  video_uuid     uuid,
  status         text default 'coding',
  finished_at    timestamptz,
  home_team_uuid uuid,
  away_team_uuid uuid,
  deleted        boolean not null default false,
  origin_id      text,
  updated_at     timestamptz not null default now()
);
drop trigger if exists asul_matches_touch on public.asul_matches;
create trigger asul_matches_touch before insert or update on public.asul_matches
  for each row execute procedure public.asul_touch();

-- ---------------------------------------------------------------------------
-- 5. Actions DataVolley (asul_actions)
-- ---------------------------------------------------------------------------
create table if not exists public.asul_actions (
  sync_uuid     uuid primary key,
  video_uuid    uuid,
  action_index  integer,
  code          text,
  timecode      real,
  system_time   bigint,
  team          text,
  player_number integer,
  action        text,
  evaluation    text,
  type          text,
  start_zone    text,
  end_zone      text,
  start_subzone text,
  end_subzone   text,
  set_number    integer,
  note          text,
  attack_zone   text,
  start_x       real,
  start_y       real,
  mid_x         real,
  mid_y         real,
  end_x         real,
  end_y         real,
  is_auto       integer default 0,
  deleted       boolean not null default false,
  origin_id     text,
  updated_at    timestamptz not null default now()
);
alter table public.asul_actions add column if not exists start_subzone text;
alter table public.asul_actions add column if not exists start_x real;
alter table public.asul_actions add column if not exists start_y real;
alter table public.asul_actions add column if not exists mid_x real;
alter table public.asul_actions add column if not exists mid_y real;
alter table public.asul_actions add column if not exists end_x real;
alter table public.asul_actions add column if not exists end_y real;
alter table public.asul_actions add column if not exists is_auto integer default 0;
drop trigger if exists asul_actions_touch on public.asul_actions;
create trigger asul_actions_touch before insert or update on public.asul_actions
  for each row execute procedure public.asul_touch();

-- ---------------------------------------------------------------------------
-- 6. Événements de match (asul_events)
-- ---------------------------------------------------------------------------
create table if not exists public.asul_events (
  sync_uuid     uuid primary key,
  video_uuid    uuid,
  kind          text,
  set_number    integer,
  point_number  integer,
  team          text,
  payload       text,
  deleted       boolean not null default false,
  origin_id     text,
  updated_at    timestamptz not null default now()
);
drop trigger if exists asul_events_touch on public.asul_events;
create trigger asul_events_touch before insert or update on public.asul_events
  for each row execute procedure public.asul_touch();

-- ---------------------------------------------------------------------------
-- 7. Six de départ par set (asul_setups)
-- ---------------------------------------------------------------------------
create table if not exists public.asul_setups (
  sync_uuid     uuid primary key,
  video_uuid    uuid,
  set_number    integer,
  first_server  text,
  home_lineup   text,
  away_lineup   text,
  deleted       boolean not null default false,
  origin_id     text,
  updated_at    timestamptz not null default now()
);
drop trigger if exists asul_setups_touch on public.asul_setups;
create trigger asul_setups_touch before insert or update on public.asul_setups
  for each row execute procedure public.asul_touch();

-- ---------------------------------------------------------------------------
-- 8. Attribution de sets en codage collaboratif (asul_set_claims)
-- ---------------------------------------------------------------------------
create table if not exists public.asul_set_claims (
  sync_uuid         uuid primary key,
  video_uuid        uuid,
  set_number        integer,
  claimed_by_uuid   text,
  claimed_by_name   text,
  claimed_by_email  text,
  claimed_at        timestamptz,
  deleted           boolean not null default false,
  origin_id         text,
  updated_at        timestamptz not null default now()
);
drop trigger if exists asul_set_claims_touch on public.asul_set_claims;
create trigger asul_set_claims_touch before insert or update on public.asul_set_claims
  for each row execute procedure public.asul_touch();

-- ---------------------------------------------------------------------------
-- 9. Matchs en direct (asul_live_sessions)
-- ---------------------------------------------------------------------------
create table if not exists public.asul_live_sessions (
  sync_uuid       uuid primary key,
  name            text not null default 'Match en direct',
  team1_name      text default 'Domicile',
  team2_name      text default 'Extérieur',
  home_team_uuid  uuid,
  away_team_uuid  uuid,
  owner_origin_id text,
  owner_user_id   integer default 0,
  join_code       text not null,
  status          text default 'active',
  current_point   integer default 1,
  point_completed text default '[]',
  video_delay     integer default 8,
  deleted_at      timestamptz,
  created_at      timestamptz default now(),
  deleted_items   jsonb not null default '[]'::jsonb,
  members         jsonb not null default '[]'::jsonb,
  actions         jsonb not null default '[]'::jsonb,
  events          jsonb not null default '[]'::jsonb,
  setups          jsonb not null default '[]'::jsonb,
  deleted         boolean not null default false,
  origin_id       text,
  updated_at      timestamptz not null default now()
);
drop trigger if exists asul_live_sessions_touch on public.asul_live_sessions;
create trigger asul_live_sessions_touch before insert or update on public.asul_live_sessions
  for each row execute procedure public.asul_touch();

-- ---------------------------------------------------------------------------
-- Politiques d'accès Row Level Security (RLS) pour la clé anon partagée du club
-- ---------------------------------------------------------------------------
alter table public.asul_teams enable row level security;
drop policy if exists "asul_teams_rw" on public.asul_teams;
create policy "asul_teams_rw" on public.asul_teams for all to anon using (true) with check (true);

alter table public.asul_trajectories enable row level security;
drop policy if exists "asul_trajectories_rw" on public.asul_trajectories;
create policy "asul_trajectories_rw" on public.asul_trajectories for all to anon using (true) with check (true);

alter table public.asul_videos enable row level security;
drop policy if exists "asul_videos_rw" on public.asul_videos;
create policy "asul_videos_rw" on public.asul_videos for all to anon using (true) with check (true);

alter table public.asul_matches enable row level security;
drop policy if exists "asul_matches_rw" on public.asul_matches;
create policy "asul_matches_rw" on public.asul_matches for all to anon using (true) with check (true);

alter table public.asul_actions enable row level security;
drop policy if exists "asul_actions_rw" on public.asul_actions;
create policy "asul_actions_rw" on public.asul_actions for all to anon using (true) with check (true);

alter table public.asul_events enable row level security;
drop policy if exists "asul_events_rw" on public.asul_events;
create policy "asul_events_rw" on public.asul_events for all to anon using (true) with check (true);

alter table public.asul_setups enable row level security;
drop policy if exists "asul_setups_rw" on public.asul_setups;
create policy "asul_setups_rw" on public.asul_setups for all to anon using (true) with check (true);

alter table public.asul_set_claims enable row level security;
drop policy if exists "asul_set_claims_rw" on public.asul_set_claims;
create policy "asul_set_claims_rw" on public.asul_set_claims for all to anon using (true) with check (true);

alter table public.asul_live_sessions enable row level security;
drop policy if exists "asul_live_sessions_rw" on public.asul_live_sessions;
create policy "asul_live_sessions_rw" on public.asul_live_sessions for all to anon using (true) with check (true);

-- Rafraîchit immédiatement le cache de schéma PostgREST
notify pgrst, 'reload schema';
