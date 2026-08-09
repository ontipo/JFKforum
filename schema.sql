-- ============================================================
-- SCHEMA SUPABASE — FORUM
-- Fdis — socle base de données
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- Extension pour générer des UUID / valeurs aléatoires
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. PROFILS (étend auth.users)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null default 'user' check (role in ('user','moderator','owner')),
  avatar_url text,
  avatar_status text not null default 'none' check (avatar_status in ('none','pending','approved','rejected')),
  banner_url text,
  banner_status text not null default 'none' check (banner_status in ('none','pending','approved','rejected')),
  -- Le code de récupération (560 caractères) n'est JAMAIS stocké en clair.
  -- On stocke uniquement son hash (SHA-256) calculé côté client avant envoi.
  recovery_code_hash text not null,
  total_likes int not null default 0,
  created_at timestamptz not null default now(),

  constraint username_format check (username ~ '^![A-Za-z0-9_]{2,30}$')
);

-- ------------------------------------------------------------
-- 2. CATÉGORIES
-- ------------------------------------------------------------
create table public.categories (
  id bigserial primary key,
  name text unique not null,
  slug text unique not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

insert into public.categories (name, slug) values
  ('Informatique', 'informatique'),
  ('Société', 'societe'),
  ('Autres', 'autres');

-- ------------------------------------------------------------
-- 3. POSTS
-- ------------------------------------------------------------
create table public.posts (
  id bigserial primary key,
  public_id text unique not null, -- 11 chiffres, généré aléatoirement -> [SITE]/?={public_id}
  author_id uuid not null references public.profiles(id) on delete cascade,
  category_id bigint not null references public.categories(id),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) >= 1),
  is_anonymous boolean not null default false,
  hashtags text[] not null default '{}',
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),

  constraint max_50_hashtags check (array_length(hashtags, 1) is null or array_length(hashtags, 1) <= 50)
);

create index posts_created_at_idx on public.posts (created_at desc);
create index posts_category_idx on public.posts (category_id);
create index posts_hashtags_idx on public.posts using gin (hashtags);
create index posts_public_id_idx on public.posts (public_id);

-- Génération automatique du public_id (11 chiffres)
create or replace function public.generate_post_public_id()
returns trigger as $$
declare
  candidate text;
  exists_already boolean;
begin
  loop
    candidate := lpad(floor(random() * 100000000000)::bigint::text, 11, '0');
    select exists(select 1 from public.posts where public_id = candidate) into exists_already;
    exit when not exists_already;
  end loop;
  new.public_id := candidate;
  return new;
end;
$$ language plpgsql;

create trigger set_post_public_id
  before insert on public.posts
  for each row execute function public.generate_post_public_id();

-- ------------------------------------------------------------
-- 4. RÉPONSES (commentaires)
-- ------------------------------------------------------------
create table public.replies (
  id bigserial primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) >= 1),
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

create index replies_post_idx on public.replies (post_id);

-- ------------------------------------------------------------
-- 5. RÉACTIONS (like / superlike / dislike)
-- ------------------------------------------------------------
create table public.reactions (
  id bigserial primary key,
  post_id bigint references public.posts(id) on delete cascade,
  reply_id bigint references public.replies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('like','superlike','dislike')),
  created_at timestamptz not null default now(),

  constraint one_target check (
    (post_id is not null and reply_id is null) or
    (post_id is null and reply_id is not null)
  ),
  constraint one_reaction_per_post_user unique (post_id, user_id),
  constraint one_reaction_per_reply_user unique (reply_id, user_id)
);

-- Empêche un auteur de liker son propre post
create or replace function public.prevent_self_like()
returns trigger as $$
declare
  target_author uuid;
begin
  if new.post_id is not null then
    select author_id into target_author from public.posts where id = new.post_id;
  else
    select author_id into target_author from public.replies where id = new.reply_id;
  end if;

  if target_author = new.user_id then
    raise exception 'Vous ne pouvez pas réagir à votre propre publication.';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger no_self_like
  before insert on public.reactions
  for each row execute function public.prevent_self_like();

-- Mise à jour du total de likes du profil (superlike = 3, like = 1, dislike = -1 sur le "poids" uniquement, pas sur total_likes affiché)
create or replace function public.update_total_likes()
returns trigger as $$
declare
  target_author uuid;
  weight int;
begin
  if TG_OP = 'DELETE' then
    if old.post_id is not null then
      select author_id into target_author from public.posts where id = old.post_id;
    else
      select author_id into target_author from public.replies where id = old.reply_id;
    end if;
    weight := case old.type when 'superlike' then -3 when 'like' then -1 else 0 end;
  else
    if new.post_id is not null then
      select author_id into target_author from public.posts where id = new.post_id;
    else
      select author_id into target_author from public.replies where id = new.reply_id;
    end if;
    weight := case new.type when 'superlike' then 3 when 'like' then 1 else 0 end;
  end if;

  update public.profiles set total_likes = greatest(0, total_likes + weight) where id = target_author;
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger reactions_update_likes
  after insert or delete on public.reactions
  for each row execute function public.update_total_likes();

-- ------------------------------------------------------------
-- 6. NOTIFICATIONS
-- ------------------------------------------------------------
create table public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('mention','like','comment')),
  data jsonb not null default '{}',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, is_read);

-- ------------------------------------------------------------
-- 7. DEMANDES D'IMAGES (avatar / bannière) — validation admin
-- ------------------------------------------------------------
create table public.image_requests (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('avatar','banner')),
  url text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.posts enable row level security;
alter table public.replies enable row level security;
alter table public.reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.image_requests enable row level security;

-- Profils : visibles par tous, modifiables uniquement par soi-même
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);

-- Catégories : lecture publique, création par modérateur/owner uniquement
create policy "categories_select_all" on public.categories for select using (true);
create policy "categories_insert_mod" on public.categories for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('moderator','owner')));

-- Posts : lecture publique (même non connecté), écriture réservée aux connectés
create policy "posts_select_all" on public.posts for select using (true);
create policy "posts_insert_auth" on public.posts for insert with check (auth.uid() = author_id);
create policy "posts_delete_own_or_mod" on public.posts for delete
  using (auth.uid() = author_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('moderator','owner')));

-- Réponses : mêmes règles que les posts
create policy "replies_select_all" on public.replies for select using (true);
create policy "replies_insert_auth" on public.replies for insert with check (auth.uid() = author_id);
create policy "replies_delete_own_or_mod" on public.replies for delete
  using (auth.uid() = author_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('moderator','owner')));

-- Réactions : lecture publique, écriture réservée aux connectés
create policy "reactions_select_all" on public.reactions for select using (true);
create policy "reactions_insert_auth" on public.reactions for insert with check (auth.uid() = user_id);
create policy "reactions_delete_own" on public.reactions for delete using (auth.uid() = user_id);

-- Notifications : visibles uniquement par leur destinataire
create policy "notifications_select_own" on public.notifications for select using (auth.uid() = user_id);
create policy "notifications_update_own" on public.notifications for update using (auth.uid() = user_id);

-- Demandes d'images : l'utilisateur voit les siennes, mod/owner voient tout
create policy "image_requests_select" on public.image_requests for select
  using (auth.uid() = user_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('moderator','owner')));
create policy "image_requests_insert_self" on public.image_requests for insert with check (auth.uid() = user_id);
create policy "image_requests_update_mod" on public.image_requests for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('moderator','owner')));

-- ------------------------------------------------------------
-- 9. NIVEAUX / TITRES (calculés côté client à partir de total_likes)
-- ------------------------------------------------------------
-- Niveau 0 : 0 likes   | Niveau 1 : 10 likes  | Niveau 2 : 50 likes
-- Niveau 3 : 100 likes | Niveau 4 : 250 likes | Niveau 5 : 500 likes
-- (voir js/badges.js)
