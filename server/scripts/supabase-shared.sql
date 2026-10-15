-- ============================================================================
-- Tables Supabase pour le partage ASUL (tout est synchronisé sauf les fichiers
-- vidéo, trop lourds pour le cloud).
--
-- À exécuter dans Supabase → SQL Editor → New query.
-- `asul_teams` existe déjà (voir SYNC.md) ; ce script ajoute les nouvelles
-- tables au fil des collections ajoutées au moteur générique syncEngine.js.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fiches de trajectoire : un match = une ligne, flèches embarquées en jsonb,
-- équipes référencées par leur sync_uuid (partagé).
-- ---------------------------------------------------------------------------
create table if not exists public.asul_trajectories (
  sync_uuid     uuid primary key,
  name          text not null,
  home_team_uuid uuid,
  away_team_uuid uuid,
  team1_name    text,
  team2_name    text,
  status        text default 'open',
  created_by    text,
  shots         jsonb not null default '[]'::jsonb,
  deleted       boolean not null default false,
  origin_id     text,
  updated_at    timestamptz not null default now()
);

-- Horodatage TOUJOURS posé par le serveur (aucun décalage d'horloge entre postes).
create or replace function public.asul_trajectories_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger asul_trajectories_touch
  before insert or update on public.asul_trajectories
  for each row execute procedure public.asul_trajectories_touch();

-- Colonne d'identité du créateur (ajoutée après coup pour les projets existants).
alter table public.asul_trajectories add column if not exists created_by text;

-- Trigger générique : updated_at = now() (réutilisé par toutes les nouvelles
-- tables ci-dessous ; asul_teams conserve son propre trigger historique).
create or replace function public.asul_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

-- Vidéos : métadonnées seules (jamais filepath/filename).
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
create trigger asul_videos_touch before insert or update on public.asul_videos
  for each row execute procedure public.asul_touch();

-- Matchs (état : terminé / en cours, équipes référencées par sync_uuid).
create table if not exists public.asul_matches (
  sync_uuid     uuid primary key,
  video_uuid    uuid,
  status        text default 'coding',
  finished_at   timestamptz,
  home_team_uuid uuid,
  away_team_uuid uuid,
  deleted       boolean not null default false,
  origin_id     text,
  updated_at    timestamptz not null default now()
);
create trigger asul_matches_touch before insert or update on public.asul_matches
  for each row execute procedure public.asul_touch();

-- Actions DataVolley (codage), une ligne par action.
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
  end_subzone   text,
  set_number    integer,
  note          text,
  attack_zone   text,
  deleted       boolean not null default false,
  origin_id     text,
  updated_at    timestamptz not null default now()
);
create trigger asul_actions_touch before insert or update on public.asul_actions
  for each row execute procedure public.asul_touch();

-- Événements de match (temps morts / remplacements).
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
create trigger asul_events_touch before insert or update on public.asul_events
  for each row execute procedure public.asul_touch();

-- Six de départ par set.
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
create trigger asul_setups_touch before insert or update on public.asul_setups
  for each row execute procedure public.asul_touch();

-- Attribution de sets (codage collaboratif) — identité du titulaire embarquée.
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
create trigger asul_set_claims_touch before insert or update on public.asul_set_claims
  for each row execute procedure public.asul_touch();

