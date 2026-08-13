-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Corrige : "infinite recursion detected in policy for relation
-- conversation_members" — la policy vérifiait l'appartenance en
-- interrogeant conversation_members depuis sa propre policy, ce qui boucle.
-- On passe par une fonction SECURITY DEFINER (qui contourne RLS) à la place.
-- ============================================================

create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid) returns boolean
security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = p_conversation_id and user_id = p_user_id
  );
$$ language sql stable;

-- ---- conversations ----
drop policy if exists "conversations visibles par leurs membres" on public.conversations;
create policy "conversations visibles par leurs membres" on public.conversations for select using (
  public.is_conversation_member(id, auth.uid())
);

-- ---- conversation_members ----
drop policy if exists "membres visibles par les membres de la conversation" on public.conversation_members;
create policy "membres visibles par les membres de la conversation" on public.conversation_members for select using (
  public.is_conversation_member(conversation_id, auth.uid())
);

-- ---- messages ----
drop policy if exists "messages visibles par les membres" on public.messages;
create policy "messages visibles par les membres" on public.messages for select using (
  public.is_conversation_member(conversation_id, auth.uid())
);

drop policy if exists "envoyer un message si membre" on public.messages;
create policy "envoyer un message si membre" on public.messages for insert with check (
  auth.uid() = sender_id and public.is_conversation_member(conversation_id, auth.uid())
);

drop policy if exists "supprimer l historique si membre" on public.messages;
create policy "supprimer l historique si membre" on public.messages for delete using (
  public.is_conversation_member(conversation_id, auth.uid())
);
