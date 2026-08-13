-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Corrige : "new row violates row-level security policy for table
-- conversations" — recrée proprement la policy qui autorise un
-- utilisateur connecté à créer une conversation (si elle manquait
-- ou avait été mal appliquée).
-- ============================================================

-- Vérifie d'abord que RLS est bien activé (ne fait rien si déjà activé)
alter table public.conversations enable row level security;

drop policy if exists "creer une conversation" on public.conversations;
create policy "creer une conversation" on public.conversations
for insert
to authenticated
with check (auth.uid() = created_by);

-- Pareil pour l'ajout des membres, au cas où
drop policy if exists "le createur ajoute des membres" on public.conversation_members;
create policy "le createur ajoute des membres" on public.conversation_members
for insert
to authenticated
with check (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = auth.uid())
);
