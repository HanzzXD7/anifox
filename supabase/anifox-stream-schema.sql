-- AniFoX-owned catalog and episode records.
-- Run this file in the Supabase SQL Editor.
-- Keep the service-role key only in server-side environment variables.

create extension if not exists pgcrypto;

create table if not exists public.anifox_anime (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  synopsis text,
  poster_url text,
  banner_url text,
  release_year integer check (release_year is null or release_year between 1900 and 2200),
  genres text[] not null default '{}',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.anifox_episodes (
  id uuid primary key default gen_random_uuid(),
  anime_id uuid not null references public.anifox_anime(id) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  title text,
  cloudflare_video_uid varchar(32),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anifox_episode_number_unique unique (anime_id, episode_number)
);

create unique index if not exists anifox_episodes_cloudflare_uid_unique
  on public.anifox_episodes (cloudflare_video_uid)
  where cloudflare_video_uid is not null;

create index if not exists anifox_anime_published_created_idx
  on public.anifox_anime (is_published, created_at desc);

create index if not exists anifox_episodes_anime_number_idx
  on public.anifox_episodes (anime_id, episode_number);

alter table public.anifox_anime enable row level security;
alter table public.anifox_episodes enable row level security;

-- No anon/authenticated table policies are created intentionally.
-- API routes use the server-only service-role key and return only published rows.
-- Never expose SUPABASE_SERVICE_ROLE_KEY in frontend code.
