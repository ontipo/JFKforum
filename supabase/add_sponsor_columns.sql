-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Prépare les colonnes nécessaires au système de parrainage
-- (le reste du système — récompenses, boutons de partage — arrive
-- dans une prochaine mise à jour).
-- ============================================================

alter table public.profiles add column if not exists sponsor_code text unique;
alter table public.profiles add column if not exists referred_by_code text;
alter table public.profiles add column if not exists referral_rewarded boolean not null default false;

-- Le trigger d'inscription doit aussi enregistrer le code de parrainage utilisé
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, recovery_code_hash, birthdate, referred_by_code)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'recovery_code_hash',
    nullif(new.raw_user_meta_data->>'birthdate', '')::date,
    nullif(new.raw_user_meta_data->>'referred_by_code', '')
  );
  return new;
end;
$$;
