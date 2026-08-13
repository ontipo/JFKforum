-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Messagerie privée entre amis (1:1 et groupes) — AUCUNE MODÉRATION
-- de contenu ici par choix (100% privé, comme demandé), seulement une
-- limite de longueur.
-- ============================================================

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 100 and char_length(body) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- ---- conversations ----
drop policy if exists "conversations visibles par leurs membres" on public.conversations;
create policy "conversations visibles par leurs membres" on public.conversations for select using (
  exists (select 1 from public.conversation_members m where m.conversation_id = id and m.user_id = auth.uid())
);

drop policy if exists "creer une conversation" on public.conversations;
create policy "creer une conversation" on public.conversations for insert with check (auth.uid() = created_by);

-- ---- conversation_members ----
drop policy if exists "membres visibles par les membres de la conversation" on public.conversation_members;
create policy "membres visibles par les membres de la conversation" on public.conversation_members for select using (
  exists (
    select 1 from public.conversation_members m2
    where m2.conversation_id = conversation_members.conversation_id and m2.user_id = auth.uid()
  )
);

drop policy if exists "le createur ajoute des membres" on public.conversation_members;
create policy "le createur ajoute des membres" on public.conversation_members for insert with check (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = auth.uid())
);

-- ---- messages ----
drop policy if exists "messages visibles par les membres" on public.messages;
create policy "messages visibles par les membres" on public.messages for select using (
  exists (select 1 from public.conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = auth.uid())
);

drop policy if exists "envoyer un message si membre" on public.messages;
create policy "envoyer un message si membre" on public.messages for insert with check (
  auth.uid() = sender_id
  and exists (select 1 from public.conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = auth.uid())
);

drop policy if exists "supprimer l historique si membre" on public.messages;
create policy "supprimer l historique si membre" on public.messages for delete using (
  exists (select 1 from public.conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = auth.uid())
);
