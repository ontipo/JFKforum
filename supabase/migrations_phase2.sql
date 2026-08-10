-- ============================================================
-- PHASE 2 — à coller dans Supabase > SQL Editor > New query
-- (à exécuter APRÈS schema.sql)
-- ============================================================

-- ------------------------------------------------------------
-- Photo de profil / bannière : lien en attente + statut de validation
-- ------------------------------------------------------------
alter table profiles add column if not exists pfp_pending_url text;
alter table profiles add column if not exists banner_pending_url text;

-- ------------------------------------------------------------
-- Posts "officiels" (publiés en tant que staff, mis en avant)
-- ------------------------------------------------------------
alter table posts add column if not exists is_official boolean not null default false;

-- ------------------------------------------------------------
-- NOTIFICATIONS
-- ------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('mention', 'like', 'comment')),
  source_post_id text references posts(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications(user_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists "notifications lecture par leur destinataire" on notifications;
create policy "notifications lecture par leur destinataire" on notifications for select using (auth.uid() = user_id);

drop policy if exists "notifications marquees lues par leur destinataire" on notifications;
create policy "notifications marquees lues par leur destinataire" on notifications for update using (auth.uid() = user_id);

drop policy if exists "notifications supprimees par leur destinataire" on notifications;
create policy "notifications supprimees par leur destinataire" on notifications for delete using (auth.uid() = user_id);

-- Pas de policy INSERT : seules les fonctions déclencheurs (ci-dessous), exécutées
-- avec les droits du propriétaire de la fonction, peuvent créer des notifications.

-- ------------------------------------------------------------
-- Notification : like / superlike reçu (pas de notif pour dislike)
-- ------------------------------------------------------------
create or replace function notify_on_vote() returns trigger as $$
declare
  target_author uuid;
begin
  if new.type in ('like', 'superlike') then
    select author_id into target_author from posts where id = new.post_id;
    if target_author is not null and target_author <> new.user_id then
      insert into notifications (user_id, type, source_post_id, actor_id)
      values (target_author, 'like', new.post_id, new.user_id);
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_on_vote on votes;
create trigger trg_notify_on_vote after insert on votes
for each row execute function notify_on_vote();

-- ------------------------------------------------------------
-- Notification : commentaire reçu
-- ------------------------------------------------------------
create or replace function notify_on_comment() returns trigger as $$
declare
  target_author uuid;
begin
  select author_id into target_author from posts where id = new.post_id;
  if target_author is not null and target_author <> new.author_id then
    insert into notifications (user_id, type, source_post_id, actor_id)
    values (target_author, 'comment', new.post_id, new.author_id);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_on_comment on comments;
create trigger trg_notify_on_comment after insert on comments
for each row execute function notify_on_comment();

-- ------------------------------------------------------------
-- Notification : mention (@!pseudo) dans un post
-- ------------------------------------------------------------
create or replace function notify_on_mention() returns trigger as $$
declare
  mentioned_username text;
  mentioned_id uuid;
begin
  if new.mentions is not null then
    foreach mentioned_username in array new.mentions loop
      select id into mentioned_id from profiles where username = mentioned_username;
      if mentioned_id is not null and mentioned_id <> new.author_id then
        insert into notifications (user_id, type, source_post_id, actor_id)
        values (mentioned_id, 'mention', new.id, new.author_id);
      end if;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_on_mention on posts;
create trigger trg_notify_on_mention after insert on posts
for each row execute function notify_on_mention();

-- ------------------------------------------------------------
-- Le staff (modérateur/owner) peut modifier n'importe quel profil
-- (rôles, statut/validation des images). L'interface limite en pratique
-- la promotion "owner"/"moderator" au fondateur uniquement.
-- ------------------------------------------------------------
drop policy if exists "staff modifie tous les profils" on profiles;
create policy "staff modifie tous les profils" on profiles for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('moderator', 'owner'))
);

-- ------------------------------------------------------------
-- Le staff peut publier des posts "officiels"
-- (la colonne is_official ne peut être forcée à true que si l'auteur est staff —
--  vérifié côté application ; RLS couvre déjà l'insertion générale des posts)
-- ------------------------------------------------------------
