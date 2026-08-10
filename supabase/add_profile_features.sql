-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Amis, badges, description de profil, paramètres.
-- ============================================================

alter table profiles add column if not exists description text default '';
alter table profiles add column if not exists settings jsonb not null default '{
  "google_translate": false,
  "public_email": false,
  "receive_emails": true,
  "accept_tags": true,
  "friends_private": false,
  "decline_friend_requests": false,
  "hide_last_seen": false
}'::jsonb;
alter table profiles add column if not exists last_seen_at timestamptz;

-- ------------------------------------------------------------
-- AMIS
-- ------------------------------------------------------------
create table if not exists friends (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint no_self_friend check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create index if not exists friends_requester_idx on friends(requester_id);
create index if not exists friends_addressee_idx on friends(addressee_id);

alter table friends enable row level security;

drop policy if exists "amis lecture publique" on friends;
create policy "amis lecture publique" on friends for select using (true);

drop policy if exists "envoyer une demande d amitie" on friends;
create policy "envoyer une demande d amitie" on friends for insert with check (auth.uid() = requester_id);

drop policy if exists "modifier une relation d amitie" on friends;
create policy "modifier une relation d amitie" on friends for update using (
  auth.uid() = requester_id or auth.uid() = addressee_id
);

drop policy if exists "supprimer une relation d amitie" on friends;
create policy "supprimer une relation d amitie" on friends for delete using (
  auth.uid() = requester_id or auth.uid() = addressee_id
);

-- ------------------------------------------------------------
-- BADGES
-- ------------------------------------------------------------
create table if not exists user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  badge_code text not null,
  awarded_by uuid references profiles(id) on delete set null,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_code)
);

alter table user_badges enable row level security;

drop policy if exists "badges lecture publique" on user_badges;
create policy "badges lecture publique" on user_badges for select using (true);

drop policy if exists "owner attribue des badges" on user_badges;
create policy "owner attribue des badges" on user_badges for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'owner')
);

drop policy if exists "owner retire des badges" on user_badges;
create policy "owner retire des badges" on user_badges for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'owner')
);
