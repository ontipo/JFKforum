-- ============================================================
-- CORRECTIF — à coller dans Supabase > SQL Editor > New query
-- Corrige : impossible de liker/superlike/disliker, notifications
-- qui ne se créent jamais, score d'auteur qui n'augmente jamais.
--
-- Cause : les fonctions déclencheurs modifiaient les lignes d'AUTRES
-- utilisateurs (profiles.likes_received, notifications) mais
-- s'exécutaient avec les droits de la personne qui vote/commente,
-- pas avec des droits élevés → bloquées par RLS → toute la
-- transaction (y compris le vote lui-même) échouait.
-- ============================================================

create or replace function apply_vote_effect() returns trigger
security definer set search_path = public as $$
declare
  target_author uuid;
begin
  if tg_op = 'INSERT' then
    select author_id into target_author from posts where id = new.post_id;
    update profiles set likes_received = likes_received + vote_weight(new.type) where id = target_author;
    return new;
  elsif tg_op = 'DELETE' then
    select author_id into target_author from posts where id = old.post_id;
    update profiles set likes_received = likes_received - vote_weight(old.type) where id = target_author;
    return old;
  end if;
  return null;
end;
$$ language plpgsql;

create or replace function notify_on_vote() returns trigger
security definer set search_path = public as $$
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

create or replace function notify_on_comment() returns trigger
security definer set search_path = public as $$
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

create or replace function notify_on_mention() returns trigger
security definer set search_path = public as $$
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
