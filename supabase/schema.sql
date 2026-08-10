-- ============================================================
-- SCHÉMA DU FORUM — à coller dans Supabase > SQL Editor > New query
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- PROFILS (1 profil = 1 utilisateur auth.users)
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username like '!%'),
  role text not null default 'user' check (role in ('user', 'moderator', 'owner')),
  recovery_code_hash text,
  likes_received integer not null default 0,
  pfp_url text,
  pfp_status text not null default 'none' check (pfp_status in ('none','pending','approved','rejected')),
  banner_url text,
  banner_status text not null default 'none' check (banner_status in ('none','pending','approved','rejected')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CATÉGORIES (Informatique / Société / Autres + celles créées par un admin)
-- ------------------------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

insert into categories (name, slug) values
  ('Informatique', 'informatique'),
  ('Société', 'societe'),
  ('Autres', 'autres')
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- GÉNÉRATEUR D'ID DE POST (11 chiffres, unique)
-- ------------------------------------------------------------
create or replace function generate_post_id() returns text as $$
declare
  new_id text;
  already_exists boolean;
begin
  loop
    new_id := lpad(floor(random() * 100000000000)::bigint::text, 11, '0');
    select exists(select 1 from posts where id = new_id) into already_exists;
    exit when not already_exists;
  end loop;
  return new_id;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- POSTS
-- ------------------------------------------------------------
create table if not exists posts (
  id text primary key default generate_post_id(),
  title text not null,
  body text not null,
  author_id uuid not null references profiles(id) on delete cascade,
  is_anonymous boolean not null default false,
  category_id uuid not null references categories(id),
  hashtags text[] not null default '{}',
  mentions text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint hashtags_max_50 check (array_length(hashtags, 1) is null or array_length(hashtags, 1) <= 50),
  constraint no_links_in_title check (title !~* '(https?://|www\.[a-z0-9-]+\.[a-z]{2,})'),
  constraint no_links_in_body check (body !~* '(https?://|www\.[a-z0-9-]+\.[a-z]{2,})')
);

create index if not exists posts_category_idx on posts(category_id);
create index if not exists posts_created_idx on posts(created_at desc);
create index if not exists posts_hashtags_idx on posts using gin(hashtags);

-- ------------------------------------------------------------
-- COMMENTAIRES / RÉPONSES
-- ------------------------------------------------------------
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id text not null references posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  constraint no_links_in_comment check (body !~* '(https?://|www\.[a-z0-9-]+\.[a-z]{2,})')
);

create index if not exists comments_post_idx on comments(post_id);

-- ------------------------------------------------------------
-- VOTES (superlike = 3, like = 1, dislike = -1) — un seul vote par personne par post
-- ------------------------------------------------------------
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  post_id text not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('like', 'dislike', 'superlike')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

-- Empêche de voter pour son propre post
create or replace function prevent_self_vote() returns trigger as $$
begin
  if exists (select 1 from posts where id = new.post_id and author_id = new.user_id) then
    raise exception 'Vous ne pouvez pas voter pour votre propre publication.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_self_vote on votes;
create trigger trg_prevent_self_vote before insert on votes
for each row execute function prevent_self_vote();

-- Poids d'un vote
create or replace function vote_weight(t text) returns integer as $$
begin
  return case t when 'superlike' then 3 when 'like' then 1 when 'dislike' then -1 else 0 end;
end;
$$ language plpgsql immutable;

-- Met à jour le compteur de likes reçus par l'auteur (utile pour les titres/niveaux)
create or replace function apply_vote_effect() returns trigger as $$
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

drop trigger if exists trg_apply_vote_effect on votes;
create trigger trg_apply_vote_effect after insert or delete on votes
for each row execute function apply_vote_effect();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table profiles enable row level security;
alter table categories enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table votes enable row level security;

-- Profils : lecture publique, chacun modifie le sien, création à l'inscription
drop policy if exists "profils lecture publique" on profiles;
create policy "profils lecture publique" on profiles for select using (true);

drop policy if exists "profil modifie par son proprietaire" on profiles;
create policy "profil modifie par son proprietaire" on profiles for update using (auth.uid() = id);

drop policy if exists "profil cree a l inscription" on profiles;
create policy "profil cree a l inscription" on profiles for insert with check (auth.uid() = id);

-- Catégories : lecture publique, création réservée aux modérateurs/owner
drop policy if exists "categories lecture publique" on categories;
create policy "categories lecture publique" on categories for select using (true);

drop policy if exists "categories creees par staff" on categories;
create policy "categories creees par staff" on categories for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role in ('moderator', 'owner'))
);

-- Posts : lecture publique, écriture par utilisateurs connectés, suppression par l'auteur ou le staff
drop policy if exists "posts lecture publique" on posts;
create policy "posts lecture publique" on posts for select using (true);

drop policy if exists "posts crees par utilisateurs connectes" on posts;
create policy "posts crees par utilisateurs connectes" on posts for insert with check (auth.uid() = author_id);

drop policy if exists "posts supprimes par auteur ou staff" on posts;
create policy "posts supprimes par auteur ou staff" on posts for delete using (
  auth.uid() = author_id or exists (select 1 from profiles where id = auth.uid() and role in ('moderator', 'owner'))
);

-- Commentaires : mêmes règles que les posts
drop policy if exists "commentaires lecture publique" on comments;
create policy "commentaires lecture publique" on comments for select using (true);

drop policy if exists "commentaires crees par utilisateurs connectes" on comments;
create policy "commentaires crees par utilisateurs connectes" on comments for insert with check (auth.uid() = author_id);

drop policy if exists "commentaires supprimes par auteur ou staff" on comments;
create policy "commentaires supprimes par auteur ou staff" on comments for delete using (
  auth.uid() = author_id or exists (select 1 from profiles where id = auth.uid() and role in ('moderator', 'owner'))
);

-- Votes : lecture publique, chacun pose/retire son propre vote
drop policy if exists "votes lecture publique" on votes;
create policy "votes lecture publique" on votes for select using (true);

drop policy if exists "votes crees par utilisateurs connectes" on votes;
create policy "votes crees par utilisateurs connectes" on votes for insert with check (auth.uid() = user_id);

drop policy if exists "votes retires par leur auteur" on votes;
create policy "votes retires par leur auteur" on votes for delete using (auth.uid() = user_id);
