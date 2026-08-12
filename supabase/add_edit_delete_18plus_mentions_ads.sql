-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- ============================================================

-- ------------------------------------------------------------
-- Réaffirme apply_vote_effect (au cas où une version antérieure aurait dévié) :
-- un vote (dont le superlike) doit augmenter à la fois le score du POST et
-- les likes_received de son auteur.
-- ------------------------------------------------------------
create or replace function apply_vote_effect() returns trigger
security definer set search_path = public as $$
declare
  target_author uuid;
  w integer;
begin
  if tg_op = 'INSERT' then
    w := vote_weight(new.type);
    select author_id into target_author from posts where id = new.post_id;
    update profiles set likes_received = likes_received + w where id = target_author;
    update posts set score = score + w where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    w := vote_weight(old.type);
    select author_id into target_author from posts where id = old.post_id;
    update profiles set likes_received = likes_received - w where id = target_author;
    update posts set score = score - w where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- E-mail visible publiquement (si l'utilisateur l'active dans ses paramètres)
-- ------------------------------------------------------------
alter table public.profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, recovery_code_hash, birthdate, referred_by_code, email)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'recovery_code_hash',
    nullif(new.raw_user_meta_data->>'birthdate', '')::date,
    nullif(new.raw_user_meta_data->>'referred_by_code', ''),
    new.email
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Édition (15 min) / suppression (5 min) par l'auteur — le staff garde ses
-- droits illimités (déjà couverts par les policies existantes).
-- ------------------------------------------------------------
alter table public.posts add column if not exists is_edited boolean not null default false;
alter table public.comments add column if not exists is_edited boolean not null default false;

drop policy if exists "posts supprimes par auteur ou staff" on public.posts;
create policy "posts supprimes par auteur (5min) ou staff" on public.posts for delete using (
  (auth.uid() = author_id and created_at > now() - interval '5 minutes')
  or exists (select 1 from public.profiles where id = auth.uid() and role in ('moderator', 'owner'))
);

drop policy if exists "auteur modifie son post" on public.posts;
create policy "auteur modifie son post (15min)" on public.posts for update using (
  auth.uid() = author_id and created_at > now() - interval '15 minutes'
);

drop policy if exists "commentaires supprimes par auteur ou staff" on public.comments;
create policy "commentaires supprimes par auteur (5min) ou staff" on public.comments for delete using (
  (auth.uid() = author_id and created_at > now() - interval '5 minutes')
  or exists (select 1 from public.profiles where id = auth.uid() and role in ('moderator', 'owner'))
);

drop policy if exists "auteur modifie son commentaire" on public.comments;
create policy "auteur modifie son commentaire (15min)" on public.comments for update using (
  auth.uid() = author_id and created_at > now() - interval '15 minutes'
);

-- ------------------------------------------------------------
-- Publication marquée 18+ par son auteur (filtre sur TOUTE la publication,
-- pas seulement l'image jointe) — réservé aux auteurs ayant vérifié leur âge,
-- vérifié côté application au moment de la création.
-- ------------------------------------------------------------
alter table public.posts add column if not exists is_18plus boolean not null default false;

-- Réglage : avertissement (floutage) sur le contenu 18+ pour les utilisateurs vérifiés
-- (déjà couvert par la colonne jsonb "settings" existante — pas de migration nécessaire,
-- la clé "blur_18plus_content" sera simplement absente tant qu'elle n'est pas activée).

-- ------------------------------------------------------------
-- Mentions de masse par le staff (@!tous, @!all, @!everyone, @!membres)
-- ------------------------------------------------------------
create or replace function notify_on_mention() returns trigger
security definer set search_path = public as $$
declare
  mentioned_username text;
  mentioned_id uuid;
  author_role text;
  mass_tokens text[] := array['!tous', '!all', '!everyone', '!membres'];
begin
  if new.mentions is null then
    return new;
  end if;

  select role into author_role from profiles where id = new.author_id;

  if author_role in ('moderator', 'owner') and new.mentions && mass_tokens then
    insert into notifications (user_id, type, source_post_id, actor_id)
    select id, 'mention', new.id, new.author_id from profiles where id <> new.author_id;
    return new;
  end if;

  foreach mentioned_username in array new.mentions loop
    select id into mentioned_id from profiles where username = mentioned_username;
    if mentioned_id is not null and mentioned_id <> new.author_id then
      insert into notifications (user_id, type, source_post_id, actor_id)
      values (mentioned_id, 'mention', new.id, new.author_id);
    end if;
  end loop;
  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- PUBLICITÉS
-- ------------------------------------------------------------
create table if not exists public.ad_stats (
  image_name text primary key,
  clicks integer not null default 0
);

alter table public.ad_stats enable row level security;

drop policy if exists "ad_stats lecture publique" on public.ad_stats;
create policy "ad_stats lecture publique" on public.ad_stats for select using (true);

create or replace function public.record_ad_click(p_image_name text) returns void
security definer set search_path = public as $$
begin
  insert into public.ad_stats (image_name, clicks) values (p_image_name, 1)
  on conflict (image_name) do update set clicks = ad_stats.clicks + 1;
end;
$$ language plpgsql;
