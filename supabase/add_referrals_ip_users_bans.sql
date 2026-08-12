-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- (après supabase/add_sponsor_columns.sql)
-- Parrainage (récompense), comptes "porte-parole IP", bans.
-- ============================================================

-- ------------------------------------------------------------
-- RÉCOMPENSE DE PARRAINAGE
-- Déclenchée quand l'e-mail vient d'être confirmé (email_confirmed_at
-- passe de null à une date), pas à l'inscription elle-même.
-- ------------------------------------------------------------
create or replace function public.reward_referral() returns trigger
security definer set search_path = public as $$
declare
  referred_profile record;
  sponsor_id uuid;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    select id, referred_by_code, referral_rewarded into referred_profile
    from public.profiles where id = new.id;

    if referred_profile.referred_by_code is not null and referred_profile.referral_rewarded = false then
      select id into sponsor_id from public.profiles where sponsor_code = referred_profile.referred_by_code;

      if sponsor_id is not null then
        update public.profiles set kc_balance = kc_balance + 14 where id = sponsor_id;
        update public.profiles set kc_balance = kc_balance + 7, referral_rewarded = true where id = referred_profile.id;
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reward_referral on auth.users;
create trigger trg_reward_referral after update on auth.users
for each row execute function public.reward_referral();

-- ------------------------------------------------------------
-- COMPTES "PORTE-PAROLE IP" (pas d'email/mot de passe — juste une IP vérifiée)
-- ------------------------------------------------------------
create table if not exists public.ip_profiles (
  id uuid primary key default gen_random_uuid(),
  ip text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.ip_profiles enable row level security;

drop policy if exists "ip_profiles lecture publique" on public.ip_profiles;
create policy "ip_profiles lecture publique" on public.ip_profiles for select using (true);
-- Pas de policy insert/update : uniquement via les fonctions Edge (clé service_role).

-- ------------------------------------------------------------
-- Les commentaires peuvent être écrits par un profil normal OU un porte-parole IP
-- ------------------------------------------------------------
alter table public.comments alter column author_id drop not null;
alter table public.comments add column if not exists ip_author_id uuid references public.ip_profiles(id) on delete cascade;

alter table public.comments drop constraint if exists comments_author_xor_ip;
alter table public.comments add constraint comments_author_xor_ip check (
  (author_id is not null and ip_author_id is null) or (author_id is null and ip_author_id is not null)
);

-- ------------------------------------------------------------
-- BANS
-- ------------------------------------------------------------
-- Emails : ban temporaire (1h à 30 jours), géré par le staff
alter table public.profiles add column if not exists banned_until timestamptz;

-- IP : ban permanent uniquement
create table if not exists public.ip_bans (
  ip text primary key,
  banned_by uuid references public.profiles(id) on delete set null,
  banned_at timestamptz not null default now()
);

alter table public.ip_bans enable row level security;

drop policy if exists "ip_bans lecture publique" on public.ip_bans;
create policy "ip_bans lecture publique" on public.ip_bans for select using (true);

drop policy if exists "staff bannit des ip" on public.ip_bans;
create policy "staff bannit des ip" on public.ip_bans for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('moderator', 'owner'))
);
-- Le ban d'e-mail (profiles.banned_until) est déjà couvert par la policy existante
-- "staff modifie tous les profils" (voir migrations_phase2.sql) — rien à ajouter ici.
