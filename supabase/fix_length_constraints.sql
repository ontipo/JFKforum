-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Corrige : voter (ou épingler, booster, etc.) sur un ancien post plantait
-- avec "violates check constraint body_length_check" — une contrainte CHECK
-- se revalide sur TOUTE modification de la ligne, même sans rapport avec le
-- texte. On la remplace par un trigger qui ne vérifie qu'à la création, ou
-- quand le titre/texte change réellement.
-- ============================================================

-- Retire les anciennes contraintes CHECK problématiques
alter table public.posts drop constraint if exists title_length_check;
alter table public.posts drop constraint if exists body_length_check;
alter table public.profiles drop constraint if exists description_length_check;

-- ------------------------------------------------------------
-- Posts : titre 5-60, texte 20+ — vérifié seulement à la création,
-- ou si le titre/texte est modifié.
-- ------------------------------------------------------------
create or replace function public.check_post_lengths() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if char_length(new.title) < 5 or char_length(new.title) > 60 then
      raise exception 'Le titre doit faire entre 5 et 60 caractères.';
    end if;
    if char_length(new.body) < 20 then
      raise exception 'Le texte doit faire au moins 20 caractères.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.title is distinct from old.title
       and (char_length(new.title) < 5 or char_length(new.title) > 60) then
      raise exception 'Le titre doit faire entre 5 et 60 caractères.';
    end if;
    if new.body is distinct from old.body and char_length(new.body) < 20 then
      raise exception 'Le texte doit faire au moins 20 caractères.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_post_lengths on public.posts;
create trigger trg_check_post_lengths before insert or update on public.posts
for each row execute function public.check_post_lengths();

-- ------------------------------------------------------------
-- Profils : description 300 caractères max — vérifié seulement si elle change.
-- ------------------------------------------------------------
create or replace function public.check_description_length() returns trigger as $$
begin
  if tg_op = 'INSERT' or new.description is distinct from old.description then
    if new.description is not null and char_length(new.description) > 300 then
      raise exception 'La description doit faire 300 caractères maximum.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_description_length on public.profiles;
create trigger trg_check_description_length before insert or update on public.profiles
for each row execute function public.check_description_length();
