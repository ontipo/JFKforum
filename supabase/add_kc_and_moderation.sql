-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- KennedCoins (K$), image de publication modérée (+18), épingle,
-- like admin (+50), vérification d'âge.
-- ============================================================

-- ------------------------------------------------------------
-- Portefeuille K$
-- ------------------------------------------------------------
alter table profiles add column if not exists kc_balance numeric(12,2) not null default 0;
alter table profiles add column if not exists last_daily_bonus_at timestamptz;
alter table profiles add column if not exists age_verified boolean not null default false;
alter table profiles add column if not exists age_verification_status text not null default 'none'
  check (age_verification_status in ('none', 'pending', 'approved', 'rejected'));
alter table profiles add column if not exists age_verification_url text;

-- ------------------------------------------------------------
-- Image jointe à une publication (lien, modérée : refusé / accepté / 18+)
-- ------------------------------------------------------------
alter table posts add column if not exists image_pending_url text;
alter table posts add column if not exists image_url text;
alter table posts add column if not exists image_status text not null default 'none'
  check (image_status in ('none', 'pending', 'approved', 'rejected', '18+'));
alter table posts add column if not exists is_pinned boolean not null default false;
alter table posts add column if not exists admin_boosted boolean not null default false;
alter table posts add column if not exists score integer not null default 0;

-- Le staff peut épingler / modérer l'image d'un post (en plus de le supprimer, déjà permis)
drop policy if exists "staff modifie les posts" on posts;
create policy "staff modifie les posts" on posts for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('moderator', 'owner'))
);

-- ------------------------------------------------------------
-- Recalcule apply_vote_effect pour aussi maintenir posts.score
-- (remplace la version de fix_triggers.sql — exécute ce fichier APRÈS)
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
-- RPC : bonus quotidien (0,5 K$, minimum 12h entre deux réclamations)
-- ------------------------------------------------------------
create or replace function claim_daily_bonus() returns numeric
security definer set search_path = public as $$
declare
  last_bonus timestamptz;
  new_balance numeric;
begin
  select last_daily_bonus_at into last_bonus from profiles where id = auth.uid();
  if last_bonus is null or now() - last_bonus >= interval '12 hours' then
    update profiles set kc_balance = kc_balance + 0.5, last_daily_bonus_at = now()
    where id = auth.uid()
    returning kc_balance into new_balance;
    return new_balance;
  end if;
  return null;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- VIREMENTS K$
-- ------------------------------------------------------------
create table if not exists kc_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  receiver_id uuid not null references profiles(id) on delete cascade,
  amount numeric(12,2) not null,   -- montant que le receveur reçoit
  charged numeric(12,2) not null,  -- montant débité de l'envoyeur
  fee_mode text not null check (fee_mode in ('sender_pays_extra', 'receiver_pays_fee')),
  reason text,
  nip_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 days'),
  accepted_at timestamptz,
  constraint no_self_transfer check (sender_id <> receiver_id)
);

alter table kc_transfers enable row level security;

drop policy if exists "virements visibles par envoyeur et receveur" on kc_transfers;
create policy "virements visibles par envoyeur et receveur" on kc_transfers for select using (
  auth.uid() = sender_id or auth.uid() = receiver_id
);
-- Pas de policy insert/update directe : tout passe par les fonctions RPC ci-dessous.

-- Crée un virement (débite l'envoyeur immédiatement, sauf s'il est staff = solde infini)
create or replace function create_kc_transfer(
  receiver_username text, p_amount numeric, p_fee_mode text, p_reason text, p_nip text
) returns uuid
security definer set search_path = public as $$
declare
  sender record;
  receiver_id uuid;
  charged numeric;
  received numeric;
  new_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'Le montant doit être positif.';
  end if;
  if p_fee_mode not in ('sender_pays_extra', 'receiver_pays_fee') then
    raise exception 'Mode de frais invalide.';
  end if;

  select id, role, kc_balance into sender from profiles where id = auth.uid();
  select id into receiver_id from profiles where username = receiver_username;
  if receiver_id is null then
    raise exception 'Utilisateur destinataire introuvable.';
  end if;
  if receiver_id = sender.id then
    raise exception 'Impossible de s''envoyer un virement à soi-même.';
  end if;

  if p_fee_mode = 'sender_pays_extra' then
    charged := round(p_amount * 1.025, 2);
    received := p_amount;
  else
    charged := p_amount;
    received := round(p_amount * 0.975, 2);
  end if;

  if sender.role not in ('moderator', 'owner') then
    if sender.kc_balance < charged then
      raise exception 'Solde K$ insuffisant.';
    end if;
    update profiles set kc_balance = kc_balance - charged where id = sender.id;
  end if;

  insert into kc_transfers (sender_id, receiver_id, amount, charged, fee_mode, reason, nip_hash)
  values (sender.id, receiver_id, received, charged, p_fee_mode, p_reason, encode(digest(p_nip, 'sha256'), 'hex'))
  returning id into new_id;

  return new_id;
end;
$$ language plpgsql;

-- Accepte un virement (le receveur doit fournir le bon NIP)
create or replace function accept_kc_transfer(transfer_id uuid, p_nip text) returns boolean
security definer set search_path = public as $$
declare
  t record;
begin
  select * into t from kc_transfers where id = transfer_id;
  if t is null then
    raise exception 'Virement introuvable.';
  end if;
  if t.receiver_id <> auth.uid() then
    raise exception 'Ce virement ne t''est pas destiné.';
  end if;
  if t.status <> 'pending' then
    raise exception 'Ce virement n''est plus en attente.';
  end if;
  if t.expires_at < now() then
    raise exception 'Ce virement a expiré.';
  end if;
  if encode(digest(p_nip, 'sha256'), 'hex') <> t.nip_hash then
    raise exception 'NIP incorrect.';
  end if;

  update profiles set kc_balance = kc_balance + t.amount where id = t.receiver_id;
  update kc_transfers set status = 'accepted', accepted_at = now() where id = transfer_id;

  return true;
end;
$$ language plpgsql;

-- Balayage des virements expirés (rembourse l'envoyeur) — sûr à appeler par n'importe qui
create or replace function expire_kc_transfers() returns void
security definer set search_path = public as $$
declare
  t record;
  sender_role text;
begin
  for t in select * from kc_transfers where status = 'pending' and expires_at < now() loop
    select role into sender_role from profiles where id = t.sender_id;
    if sender_role not in ('moderator', 'owner') then
      update profiles set kc_balance = kc_balance + t.charged where id = t.sender_id;
    end if;
    update kc_transfers set status = 'expired' where id = t.id;
  end loop;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- Like admin (+50 likes à l'auteur, un seul par post)
-- ------------------------------------------------------------
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
  update posts set admin_boosted = true, score = score + 50 where id = p_post_id;

  return true;
end;
$$ language plpgsql;
