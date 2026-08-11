-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- ============================================================

-- Le like admin (+50) ne doit augmenter que likes_received, pas le score du post
create or replace function admin_grant_like_boost(p_post_id text) returns boolean
security definer set search_path = public as $$
declare
  target_author uuid;
  already boolean;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role in ('moderator', 'owner')) then
    raise exception 'Réservé au staff.';
  end if;

  select admin_boosted, author_id into already, target_author from posts where id = p_post_id;
  if already then
    raise exception 'Déjà appliqué sur ce post.';
  end if;

  update profiles set likes_received = likes_received + 50 where id = target_author;
  update posts set admin_boosted = true where id = p_post_id;

  return true;
end;
$$ language plpgsql;

-- Traçabilité : qui a validé la vérification d'âge
alter table profiles add column if not exists age_verified_by uuid references profiles(id) on delete set null;

-- Date de naissance (saisie à l'inscription) — nécessaire pour bloquer la vérification d'âge des mineurs
alter table profiles add column if not exists birthdate date;

-- Visibilité publique optionnelle du solde K$ et du statut de vérification d'âge (désactivé par défaut)
alter table profiles alter column settings set default '{
  "google_translate": false,
  "public_email": false,
  "receive_emails": true,
  "accept_tags": true,
  "friends_private": false,
  "decline_friend_requests": false,
  "hide_last_seen": false,
  "show_kc_balance": false,
  "show_age_verified": false
}'::jsonb;

-- Code promo saisi lors d'une demande d'hébergement physique (vérifié manuellement par un admin)
alter table profiles add column if not exists pfp_promo_code text;
alter table profiles add column if not exists banner_promo_code text;

-- Longueurs minimales/maximales (renfort côté base, en plus de la validation côté site)
-- NOT VALID : s'applique aux nouvelles publications seulement, ignore les anciennes lignes existantes.
alter table posts drop constraint if exists title_length_check;
alter table posts add constraint title_length_check check (char_length(title) between 5 and 60) not valid;

alter table posts drop constraint if exists body_length_check;
alter table posts add constraint body_length_check check (char_length(body) >= 20) not valid;

alter table profiles drop constraint if exists description_length_check;
alter table profiles add constraint description_length_check check (description is null or char_length(description) <= 300) not valid;

-- Le trigger d'inscription doit maintenant aussi enregistrer la date de naissance
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, username, recovery_code_hash, birthdate)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'recovery_code_hash',
    nullif(new.raw_user_meta_data->>'birthdate', '')::date
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
