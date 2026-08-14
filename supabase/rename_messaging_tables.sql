-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Renomme les tables de messagerie pour éviter les mots "conversation"/
-- "message" que beaucoup de bloqueurs de pub/vie privée bloquent par
-- défaut (règles anti-widgets-de-chat tiers comme Intercom/Drift/Zendesk).
-- ============================================================

alter table if exists public.conversations rename to dm_threads;
alter table if exists public.conversation_members rename to dm_thread_members;
alter table if exists public.messages rename to dm_entries;

alter table public.dm_thread_members rename column conversation_id to thread_id;
alter table public.dm_entries rename column conversation_id to thread_id;

-- Recrée la fonction utilitaire avec les nouveaux noms
create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid) returns boolean
security definer set search_path = public as $$
  select exists (
    select 1 from dm_thread_members
    where thread_id = p_conversation_id and user_id = p_user_id
  );
$$ language sql stable;

-- Recrée toutes les policies avec les nouveaux noms de table
drop policy if exists "conversations visibles par leurs membres" on public.dm_threads;
create policy "dm_threads visibles par leurs membres" on public.dm_threads for select using (
  public.is_conversation_member(id, auth.uid())
);

drop policy if exists "creer une conversation" on public.dm_threads;
drop policy if exists "conversations: créer si created_by" on public.dm_threads;
create policy "creer un dm_thread" on public.dm_threads
for insert to authenticated
with check (auth.uid() = created_by);

drop policy if exists "membres visibles par les membres de la conversation" on public.dm_thread_members;
create policy "dm_thread_members visibles par les membres" on public.dm_thread_members for select using (
  public.is_conversation_member(thread_id, auth.uid())
);

drop policy if exists "le createur ajoute des membres" on public.dm_thread_members;
create policy "le createur ajoute des membres" on public.dm_thread_members
for insert to authenticated
with check (
  exists (select 1 from public.dm_threads t where t.id = thread_id and t.created_by = auth.uid())
);

drop policy if exists "messages visibles par les membres" on public.dm_entries;
create policy "dm_entries visibles par les membres" on public.dm_entries for select using (
  public.is_conversation_member(thread_id, auth.uid())
);

drop policy if exists "envoyer un message si membre" on public.dm_entries;
create policy "envoyer un dm_entry si membre" on public.dm_entries for insert with check (
  auth.uid() = sender_id and public.is_conversation_member(thread_id, auth.uid())
);

drop policy if exists "supprimer l historique si membre" on public.dm_entries;
create policy "supprimer l historique dm si membre" on public.dm_entries for delete using (
  public.is_conversation_member(thread_id, auth.uid())
);
